import { describe, expect, it } from "vitest";
import { fakeStorage } from "../test/storage";
import { SAVED_LOOKUPS_VERSION, createSavedLookups, type StorageArea } from "./saved-lookups";

const DAY = 24 * 60 * 60 * 1000;
const isText = (v: unknown): v is string => typeof v === "string";

/** A clock the test moves by hand. */
function clock(start = Date.UTC(2026, 9, 1)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("saved lookups", () => {
  it("returns what was saved, also to a new instance over the same storage, as after a restart", async () => {
    const storage = fakeStorage();
    await createSavedLookups(storage.area).set("explain:fr|en|mange", "to eat");
    await expect(createSavedLookups(storage.area).get("explain:fr|en|mange", isText)).resolves.toBe("to eat");
    await expect(createSavedLookups(storage.area).get("explain:fr|en|manger", isText)).resolves.toBeUndefined();
  });

  it("keys entries by format version", async () => {
    const storage = fakeStorage();
    await createSavedLookups(storage.area).set("explain:fr|en|mange", "to eat");
    expect(storage.keys().some((k) => k.includes(`:${SAVED_LOOKUPS_VERSION}:explain:fr|en|mange`))).toBe(true);
  });

  it("forgets entries after 30 days", async () => {
    const storage = fakeStorage();
    const time = clock();
    const saved = createSavedLookups(storage.area, { now: time.now });
    await saved.set("a", "first");
    time.advance(29 * DAY);
    await expect(saved.get("a", isText)).resolves.toBe("first");
    time.advance(2 * DAY);
    await expect(saved.get("a", isText)).resolves.toBeUndefined();
    expect(await saved.stats()).toEqual({ count: 0, bytes: 0 });
    expect(storage.keys().filter((k) => k !== "lookup:index")).toEqual([]);
  });

  it("drops expired entries to make room when saving", async () => {
    const storage = fakeStorage();
    const time = clock();
    const saved = createSavedLookups(storage.area, { now: time.now });
    await saved.set("old", "x");
    time.advance(31 * DAY);
    await saved.set("new", "y");
    expect((await saved.stats()).count).toBe(1);
    expect(storage.dump()).not.toContain("old");
  });

  it("evicts the least recently used entries to stay within its budget", async () => {
    const storage = fakeStorage();
    const time = clock();
    const big = "x".repeat(800);
    // Room for ten entries of this size, with the index.
    const saved = createSavedLookups(storage.area, { now: time.now, budget: 10_000 });
    const keys = Array.from({ length: 10 }, (_, i) => `k${i}`);
    for (const key of keys) {
      await saved.set(key, big);
      time.advance(1000);
    }
    expect((await saved.stats()).count).toBe(10);
    await saved.get("k0", isText); // k0 is now more recent than k1
    time.advance(1000);
    await saved.set("new", big);
    await expect(saved.get("k1", isText)).resolves.toBeUndefined();
    for (const key of [...keys.filter((k) => k !== "k1"), "new"]) await expect(saved.get(key, isText)).resolves.toBe(big);
    const { count, bytes } = await saved.stats();
    expect(count).toBe(10);
    expect(bytes).toBeLessThanOrEqual(10_000);
    expect(storage.dump().length).toBeLessThanOrEqual(10_000);
  });

  it("doesn't save a result too big for its budget", async () => {
    const storage = fakeStorage();
    const saved = createSavedLookups(storage.area, { budget: 1000 });
    await saved.set("huge", "x".repeat(2000));
    await expect(saved.get("huge", isText)).resolves.toBeUndefined();
    expect(storage.dump()).not.toContain("huge");
  });

  it("ignores entries saved by another format version, and removes them when it next saves", async () => {
    const storage = fakeStorage({
      "lookup:index": { version: SAVED_LOOKUPS_VERSION - 1, items: { "lookup:0:a": { size: 10, savedAt: 1, usedAt: 1 } } },
      "lookup:0:a": { version: SAVED_LOOKUPS_VERSION - 1, savedAt: 1, value: "old shape" },
      lastLanguage: "fr",
    });
    const saved = createSavedLookups(storage.area);
    await expect(saved.get("a", isText)).resolves.toBeUndefined();
    await saved.set("b", "new");
    expect(storage.keys().sort()).toEqual([`lookup:${SAVED_LOOKUPS_VERSION}:b`, "lookup:index", "lastLanguage"].sort());
  });

  it("treats a missing index as an empty cache", async () => {
    const storage = fakeStorage();
    const saved = createSavedLookups(storage.area);
    await saved.set("a", "value");
    storage.data.delete("lookup:index");
    await expect(saved.get("a", isText)).resolves.toBeUndefined();
    await saved.set("b", "value");
    expect(await saved.stats()).toMatchObject({ count: 1 });
  });

  it("ignores corrupt or unexpected stored values", async () => {
    const storage = fakeStorage();
    const saved = createSavedLookups(storage.area);
    await saved.set("a", "text");
    await saved.set("b", "text");
    await saved.set("c", "text");
    storage.data.set(`lookup:${SAVED_LOOKUPS_VERSION}:a`, JSON.stringify("not a saved record"));
    storage.data.set(`lookup:${SAVED_LOOKUPS_VERSION}:b`, JSON.stringify({ version: SAVED_LOOKUPS_VERSION, savedAt: Date.now(), value: 42 }));
    await expect(saved.get("a", isText)).resolves.toBeUndefined();
    await expect(saved.get("b", isText)).resolves.toBeUndefined(); // the wrong shape for its caller
    await expect(saved.get("c", isText)).resolves.toBe("text");
    expect((await saved.stats()).count).toBe(1);

    storage.data.set("lookup:index", JSON.stringify({ version: SAVED_LOOKUPS_VERSION, items: "garbage" }));
    await expect(saved.get("c", isText)).resolves.toBeUndefined();
    await saved.set("d", "text");
    await expect(saved.get("d", isText)).resolves.toBe("text");
  });

  it("never fails when storage does", async () => {
    const broken: StorageArea = {
      get: () => Promise.reject(new Error("unavailable")),
      set: () => Promise.reject(new Error("QUOTA_BYTES quota exceeded")),
      remove: () => Promise.reject(new Error("unavailable")),
    };
    const saved = createSavedLookups(broken);
    await expect(saved.set("a", "x")).resolves.toBeUndefined();
    await expect(saved.get("a", isText)).resolves.toBeUndefined();
    await expect(saved.stats()).resolves.toEqual({ count: 0, bytes: 0 });
    await expect(saved.clear()).resolves.toBe(false);
  });

  it("keeps working after a write fails", async () => {
    const storage = fakeStorage();
    let full = true;
    const area: StorageArea = {
      ...storage.area,
      set: (items) => (full ? Promise.reject(new Error("QUOTA_BYTES quota exceeded")) : storage.area.set(items)),
    };
    const saved = createSavedLookups(area);
    await saved.set("a", "x");
    await expect(saved.get("a", isText)).resolves.toBeUndefined();
    full = false;
    await saved.set("a", "x");
    await expect(saved.get("a", isText)).resolves.toBe("x");
  });

  it("counts what's saved, and clears it without touching anything else", async () => {
    const storage = fakeStorage({ lastLanguage: "es" });
    const saved = createSavedLookups(storage.area);
    await saved.set("a", "one");
    await saved.set("b", "two");
    const stats = await saved.stats();
    expect(stats.count).toBe(2);
    expect(stats.bytes).toBeGreaterThan(0);
    await expect(saved.clear()).resolves.toBe(true);
    expect(await saved.stats()).toEqual({ count: 0, bytes: 0 });
    expect(storage.keys()).toEqual(["lastLanguage"]);
  });
});
