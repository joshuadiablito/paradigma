import type { StorageArea } from "../shared/saved-lookups";

/**
 * An in-memory stand-in for chrome.storage.local. Values are stored as JSON,
 * as Chrome does, so a test can't keep a reference to what it saved.
 */
export function fakeStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  const list = (keys: string | string[]) => (Array.isArray(keys) ? keys : [keys]);
  const area: StorageArea = {
    async get(keys) {
      const wanted = keys === null ? [...data.keys()] : list(keys);
      const out: Record<string, unknown> = {};
      for (const k of wanted) {
        const json = data.get(k);
        if (json !== undefined) out[k] = JSON.parse(json);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, JSON.stringify(v));
    },
    async remove(keys) {
      for (const k of list(keys)) data.delete(k);
    },
  };
  return {
    area,
    data,
    /** Everything stored, as one string, to search for what mustn't be there. */
    dump: () => [...data].map(([k, v]) => `${k}=${v}`).join("\n"),
    keys: () => [...data.keys()],
  };
}

/** Lets fire-and-forget saves finish. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
