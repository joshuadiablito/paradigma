import { describe, expect, it } from "vitest";
import { PromiseCache } from "./cache";

describe("PromiseCache", () => {
  it("shares one request between concurrent callers", async () => {
    const cache = new PromiseCache<number>(10);
    let calls = 0;
    const load = async () => ++calls;
    await Promise.all([cache.get("a", load), cache.get("a", load)]);
    expect(calls).toBe(1);
  });

  it("evicts the least recently used entry", async () => {
    const cache = new PromiseCache<string>(2);
    await cache.get("a", async () => "a");
    await cache.get("b", async () => "b");
    await cache.get("a", async () => "never"); // touch a
    await cache.get("c", async () => "c"); // evicts b
    await expect(cache.get("a", async () => "reloaded")).resolves.toBe("a");
    await expect(cache.get("b", async () => "reloaded")).resolves.toBe("reloaded");
  });

  it("forgets failures so the next request retries", async () => {
    const cache = new PromiseCache<string>(10);
    await expect(cache.get("a", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    await expect(cache.get("a", async () => "ok")).resolves.toBe("ok");
  });
});
