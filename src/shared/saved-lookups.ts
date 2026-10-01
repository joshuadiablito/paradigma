// Recent lookups' results, saved in chrome.storage.local so that they outlive
// the service worker. Chrome stops an idle worker after about 30 seconds,
// taking its in-memory cache with it, and selecting the same word a minute
// later would otherwise fetch it all again and spend MyMemory allowance again.
//
// An index (one storage key) records each saved result's size and when it was
// saved and last used, so writes can expire and evict entries without listing
// every key in storage. Every failure here (storage full or unavailable, a
// corrupt or unexpected value, a missing index) is treated as "not saved", so
// the lookup falls back to fetching; nothing here ever fails a lookup.

/** The promise API of chrome.storage.local that this needs, so tests can use a fake. */
export interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/**
 * Bump when the shape of a saved result changes. Entries saved under another
 * version are ignored, and removed the next time the index is rebuilt.
 */
export const SAVED_LOOKUPS_VERSION = 1;
/** Every key this module writes starts with this, and nothing else's does. */
const PREFIX = "lookup:";
const INDEX_KEY = `${PREFIX}index`;
const DAY = 24 * 60 * 60 * 1000;

export interface SavedLookupsOptions {
  /** Most bytes (as JSON) to keep. chrome.storage.local allows 10 MB in all; this keeps to half. */
  budget?: number;
  /** How long a result is trusted: dictionaries and translations do change. */
  maxAge?: number;
  now?: () => number;
}

interface IndexItem {
  /** Approximate bytes: the key plus the saved record as JSON. */
  size: number;
  savedAt: number;
  usedAt: number;
}

interface Index {
  version: number;
  items: Record<string, IndexItem>;
}

interface Saved {
  version: number;
  savedAt: number;
  value: unknown;
}

export interface SavedLookupsStats {
  count: number;
  /** Approximate bytes used, as JSON. */
  bytes: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isItem = (v: unknown): v is IndexItem =>
  isRecord(v) && isTime(v.size) && v.size > 0 && isTime(v.savedAt) && isTime(v.usedAt);

/** The index as stored, or undefined if it's missing, from another version or not an index at all. */
function readIndex(raw: unknown): Index | undefined {
  if (!isRecord(raw) || raw.version !== SAVED_LOOKUPS_VERSION || !isRecord(raw.items)) return undefined;
  const items: Record<string, IndexItem> = {};
  for (const [key, item] of Object.entries(raw.items)) if (key.startsWith(PREFIX) && isItem(item)) items[key] = item;
  return { version: SAVED_LOOKUPS_VERSION, items };
}

const isSaved = (v: unknown): v is Saved =>
  isRecord(v) && v.version === SAVED_LOOKUPS_VERSION && isTime(v.savedAt) && "value" in v;

/** Room an item takes, counting its line in the index too. */
const footprint = (key: string, item: IndexItem) => item.size + key.length + 64;

export function createSavedLookups(storage: StorageArea, options: SavedLookupsOptions = {}) {
  const budget = options.budget ?? 5_000_000;
  const maxAge = options.maxAge ?? 30 * DAY;
  const now = options.now ?? Date.now;
  // One result is never worth more than a tenth of the budget: a huge entry
  // would otherwise push out dozens of ordinary ones.
  const maxEntry = budget / 10;

  // Operations run one at a time, each reading the index afresh, so that two
  // lookups finishing together don't overwrite each other's index updates.
  let queue: Promise<unknown> = Promise.resolve();
  function serially<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    const run = queue.then(op).catch(() => fallback);
    queue = run;
    return run;
  }

  const storageKey = (key: string) => `${PREFIX}${SAVED_LOOKUPS_VERSION}:${key}`;
  const expired = (item: { savedAt: number }, at: number) => at - item.savedAt > maxAge || item.savedAt > at;

  /** Removes everything this module ever saved, whatever its version. */
  async function removeAll(): Promise<void> {
    const keys = Object.keys(await storage.get(null)).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 0) await storage.remove(keys);
  }

  return {
    /**
     * A saved result, if there is one that's current and `isValid` accepts;
     * otherwise undefined. Marks it as just used.
     */
    get<T>(key: string, isValid: (value: unknown) => value is T): Promise<T | undefined> {
      return serially(async () => {
        const id = storageKey(key);
        const stored = await storage.get([INDEX_KEY, id]);
        const index = readIndex(stored[INDEX_KEY]);
        const item = index?.items[id];
        if (!index || !item) return undefined;
        const saved = stored[id];
        const at = now();
        if (!isSaved(saved) || expired(item, at) || expired(saved, at) || !isValid(saved.value)) {
          delete index.items[id];
          await storage.remove(id).catch(() => {});
          await storage.set({ [INDEX_KEY]: index });
          return undefined;
        }
        item.usedAt = at;
        // Failing to record the use only makes eviction less exact.
        await storage.set({ [INDEX_KEY]: index }).catch(() => {});
        return saved.value;
      }, undefined);
    },

    /**
     * Saves a result, making room by dropping expired entries and then the
     * least recently used. Never rejects: not saving is always acceptable.
     */
    set(key: string, value: unknown): Promise<void> {
      return serially(async () => {
        const id = storageKey(key);
        const at = now();
        const record: Saved = { version: SAVED_LOOKUPS_VERSION, savedAt: at, value };
        const size = id.length + JSON.stringify(record).length;
        if (size > maxEntry) return;

        let index = readIndex((await storage.get(INDEX_KEY))[INDEX_KEY]);
        if (!index) {
          // No usable index: anything saved before it (another version's
          // entries, or orphans of a lost index) can't be accounted for.
          await removeAll();
          index = { version: SAVED_LOOKUPS_VERSION, items: {} };
        }
        delete index.items[id];
        const item: IndexItem = { size, savedAt: at, usedAt: at };
        const drop = Object.entries(index.items).filter(([, i]) => expired(i, at)).map(([k]) => k);
        for (const k of drop) delete index.items[k];
        const byUse = Object.entries(index.items).sort(([, a], [, b]) => a.usedAt - b.usedAt);
        let total = byUse.reduce((sum, [k, i]) => sum + footprint(k, i), footprint(id, item) + INDEX_KEY.length + 32);
        for (const [k, i] of byUse) {
          if (total <= budget) break;
          delete index.items[k];
          drop.push(k);
          total -= footprint(k, i);
        }
        if (drop.length > 0) await storage.remove(drop);
        index.items[id] = item;
        // Entry and index in one write, so neither is saved without the other.
        await storage.set({ [id]: record, [INDEX_KEY]: index });
      }, undefined);
    },

    /** How many results are saved and roughly how much room they take. */
    stats(): Promise<SavedLookupsStats> {
      return serially(async () => {
        const index = readIndex((await storage.get(INDEX_KEY))[INDEX_KEY]);
        const items = Object.entries(index?.items ?? {});
        const bytes = items.reduce((sum, [k, i]) => sum + footprint(k, i), 0);
        return { count: items.length, bytes };
      }, { count: 0, bytes: 0 });
    },

    /** Removes every saved result, and nothing else. Resolves to whether that worked. */
    clear(): Promise<boolean> {
      return serially(async () => {
        await removeAll();
        return true;
      }, false);
    },
  };
}

export type SavedLookups = ReturnType<typeof createSavedLookups>;

/** For the settings page: "About 1.2 MB in 85 saved results". Rough, since size is measured as JSON. */
export function describeSavedLookups({ count, bytes }: SavedLookupsStats): string {
  if (count === 0) return "Nothing saved at the moment.";
  const size = bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `About ${size} in ${count} saved ${count === 1 ? "result" : "results"}.`;
}
