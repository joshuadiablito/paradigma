import { describe, expect, it } from "vitest";
import { fixture } from "../test/fixtures";
import { fakeStorage, settle } from "../test/storage";
import { createLookupService } from "./lookup-service";

/**
 * Serves kaikki fixtures by "Language/word" and a canned MyMemory reply,
 * recording each request. `state` can be changed to make a provider fail.
 */
function fakeFetch(words: Record<string, string>) {
  const requested: string[] = [];
  const urls: URL[] = [];
  const state = { kaikki: "up" as "up" | "down", myMemory: "up" as "up" | "down" | "over limit" | "offline" };
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    if (url.hostname === "kaikki.org") {
      const parts = url.pathname.split("/").map(decodeURIComponent);
      const key = `${parts[2]}/${parts.at(-1)!.replace(/\.jsonl$/, "")}`;
      requested.push(key);
      if (state.kaikki === "down") return new Response("", { status: 503 });
      const name = words[key];
      return name ? new Response(fixture(name)) : new Response("", { status: 404 });
    }
    requested.push(`MyMemory ${url.searchParams.get("langpair")}`);
    if (state.myMemory === "offline") throw new TypeError("Failed to fetch");
    if (state.myMemory === "down") return new Response("", { status: 500 });
    if (state.myMemory === "over limit") {
      return Response.json({ responseStatus: 429, quotaFinished: true, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } });
    }
    return Response.json({ responseStatus: 200, responseData: { translatedText: "x" } });
  }) as typeof fetch;
  return { fn, requested, urls, state };
}

const words = {
  "English/eat": "english-eat",
  "French/manger": "french-manger",
  "Spanish/comer": "spanish-comer",
  "Greek/τρώω": "greek-troo",
};
const settings = { native: "en", learning: ["fr", "el", "es"] };

describe("lookup service", () => {
  it("reuses the selection's English entry when another language's tab is chosen", async () => {
    const { fn, requested } = fakeFetch(words);
    const service = createLookupService(fn);
    const result = await service.lookup(" eat ", "en", settings);
    expect(result.kind === "translate" && result.first?.lang).toBe("fr");
    expect(requested.filter((r) => r.startsWith("Greek/") || r.startsWith("Spanish/") || r === "MyMemory en|es" || r === "MyMemory en|el")).toEqual([]);

    requested.length = 0;
    const greek = await service.translateLanguage("eat", "en", "el", settings);
    expect(greek.lead).toBe("τρώω");
    expect(requested.some((r) => r.startsWith("English/"))).toBe(false);
    expect(requested.filter((r) => r.startsWith("French/") || r.startsWith("Spanish/") || r === "MyMemory en|fr" || r === "MyMemory en|es")).toEqual([]);
    expect(requested).toContain("Greek/τρώω");
  });

  it("fetches nothing when a language already loaded is asked for again, or the selection looked up again", async () => {
    const { fn, requested } = fakeFetch(words);
    const service = createLookupService(fn);
    await service.lookup("eat", "en", settings);
    await service.translateLanguage("eat", "en", "es", settings);
    requested.length = 0;
    await service.translateLanguage("eat", "en", "es", settings);
    await service.lookup("eat", "en", settings, "es");
    expect(requested).toEqual([]);
  });

  it("explains text in a language being learned", async () => {
    const { fn } = fakeFetch({ "French/manger": "french-manger" });
    const result = await createLookupService(fn).lookup("manger", "fr", settings);
    expect(result.kind).toBe("explain");
  });
});

describe("lookup service: the optional MyMemory email", () => {
  const sentTo = (urls: URL[], host: string) => urls.filter((u) => u.hostname === host).map((u) => u.searchParams.get("de"));

  it("sends the email with every MyMemory request, and never to kaikki.org", async () => {
    const { fn, urls } = fakeFetch(words);
    const service = createLookupService(fn);
    const withEmail = { ...settings, myMemoryEmail: "ana@example.com" };
    await service.lookup("eat", "en", withEmail);
    await service.translateLanguage("eat", "en", "es", withEmail);
    await service.lookup("je voudrais manger une pomme", "fr", withEmail);
    const myMemory = sentTo(urls, "api.mymemory.translated.net");
    expect(myMemory.length).toBeGreaterThanOrEqual(3);
    expect(myMemory.every((de) => de === "ana@example.com")).toBe(true);
    expect(urls.filter((u) => u.hostname === "kaikki.org").length).toBeGreaterThan(0);
    expect(urls.filter((u) => u.hostname === "kaikki.org").every((u) => !String(u).includes("example.com"))).toBe(true);
  });

  it("uses a changed email at once, and stops sending a cleared one", async () => {
    const { fn, urls } = fakeFetch(words);
    const service = createLookupService(fn);
    await service.lookup("one phrase to translate here", "fr", { ...settings, myMemoryEmail: "ana@example.com" });
    await service.lookup("another phrase to translate here", "fr", { ...settings, myMemoryEmail: "bo@example.com" });
    await service.lookup("a third phrase to translate here", "fr", { ...settings, myMemoryEmail: "" });
    await service.lookup("a fourth phrase to translate here", "fr", settings);
    expect(sentTo(urls, "api.mymemory.translated.net")).toEqual(["ana@example.com", "bo@example.com", null, null]);
  });

  it("shares cached results whatever the email, since they don't depend on it", async () => {
    const { fn, requested } = fakeFetch(words);
    const service = createLookupService(fn);
    await service.lookup("eat", "en", { ...settings, myMemoryEmail: "ana@example.com" });
    requested.length = 0;
    await service.lookup("eat", "en", settings);
    expect(requested).toEqual([]);
  });
});

describe("lookup service: saved lookups", () => {
  const phrase = "je voudrais manger une pomme";

  /** Runs some lookups, lets their saves finish, and returns a fresh service over the same storage, as after Chrome stops the worker. */
  async function restart(storage: ReturnType<typeof fakeStorage>, fn: typeof fetch) {
    await settle();
    return createLookupService(fn, storage.area);
  }

  it("serves lookups from storage after the service worker restarts", async () => {
    const storage = fakeStorage();
    const { fn, requested } = fakeFetch({ ...words, "French/mange": "french-mange" });
    const before = createLookupService(fn, storage.area);
    const eat = await before.lookup("eat", "en", settings);
    const spanish = await before.translateLanguage("eat", "en", "es", settings);
    const mange = await before.lookup("mange", "fr", settings);
    const sentence = await before.lookup(phrase, "fr", settings);

    const after = await restart(storage, fn);
    requested.length = 0;
    expect(await after.lookup("eat", "en", settings)).toEqual(eat);
    expect(await after.translateLanguage("eat", "en", "es", settings)).toEqual(spanish);
    expect(await after.lookup("mange", "fr", settings)).toEqual(mange);
    expect(await after.lookup(phrase, "fr", settings)).toEqual(sentence);
    expect(requested).toEqual([]);
  });

  it("keeps lookups for different languages apart", async () => {
    const storage = fakeStorage();
    const { fn, requested } = fakeFetch(words);
    await createLookupService(fn, storage.area).lookup("eat", "en", settings);
    const after = await restart(storage, fn);
    requested.length = 0;
    const result = await after.lookup("eat", "en", { ...settings, learning: ["es"] });
    expect(result.kind === "translate" && result.first?.lang).toBe("es");
    expect(requested).toContain("English/eat");
    expect(requested).toContain("Spanish/comer");
  });

  it("doesn't save a translation made while MyMemory was over its limit, even one that succeeded", async () => {
    const storage = fakeStorage();
    const { fn, requested, state } = fakeFetch(words);
    state.myMemory = "over limit";
    // The dictionary has French translations; MyMemory only breaks ties, so
    // the lookup succeeds without it, quietly.
    const eat = await createLookupService(fn, storage.area).lookup("eat", "en", settings);
    expect(eat.kind === "translate" && eat.first?.outcome.ok).toBe(true);

    state.myMemory = "up";
    const after = await restart(storage, fn);
    requested.length = 0;
    await after.lookup("eat", "en", settings);
    expect(requested).toContain("MyMemory en|fr");
    expect(requested).not.toContain("English/eat"); // the English entry was sound, so it was kept
  });

  it("doesn't save an explanation made while the dictionary was down", async () => {
    const storage = fakeStorage();
    const { fn, requested, state } = fakeFetch(words);
    state.kaikki = "down";
    const result = await createLookupService(fn, storage.area).lookup("manger", "fr", settings);
    expect(result.kind === "explain" && result.warnings).toEqual(["Dictionary unavailable: kaikki.org responded 503"]);

    state.kaikki = "up";
    const after = await restart(storage, fn);
    requested.length = 0;
    const again = await after.lookup("manger", "fr", settings);
    expect(again.kind === "explain" && again.warnings).toEqual([]);
    expect(requested).toContain("French/manger");
  });

  it("doesn't save a language translated from an English entry that couldn't be fetched", async () => {
    const storage = fakeStorage();
    const { fn, requested, state } = fakeFetch(words);
    const before = createLookupService(fn, storage.area);
    state.kaikki = "down";
    await before.lookup("eat", "en", settings);
    // The dictionary is back, but this tab is translated from the source
    // already in memory, which lacks the English entry.
    state.kaikki = "up";
    const spanish = await before.translateLanguage("eat", "en", "es", settings);
    expect(spanish).toMatchObject({ machine: "x", senses: [] });

    const after = await restart(storage, fn);
    requested.length = 0;
    const again = await after.translateLanguage("eat", "en", "es", settings);
    expect(again.lead).toBe("comer");
    expect(requested).toContain("English/eat");
  });

  it("never saves a failure", async () => {
    const storage = fakeStorage();
    const { fn, requested, state } = fakeFetch(words);
    state.myMemory = "offline";
    state.kaikki = "down";
    const before = createLookupService(fn, storage.area);
    await expect(before.lookup("manger", "fr", settings)).rejects.toThrow(/Translation unavailable/);
    // A phrase isn't looked up in the dictionary, so it comes back with a warning instead.
    const sentence = await before.lookup(phrase, "fr", settings);
    expect(sentence.kind === "explain" && sentence.warnings).toEqual(["Translation unavailable: Failed to fetch"]);
    await settle();
    expect(storage.dump()).not.toContain("manger");
    expect(storage.dump()).not.toContain("pomme");

    state.myMemory = "up";
    state.kaikki = "up";
    const after = await restart(storage, fn);
    requested.length = 0;
    const result = await after.lookup(phrase, "fr", settings);
    expect(result.kind === "explain" && result.translation?.text).toBe("x");
    expect(requested).toEqual(["MyMemory fr|en"]);
  });

  it("never saves the email address", async () => {
    const storage = fakeStorage();
    const { fn } = fakeFetch(words);
    const service = createLookupService(fn, storage.area);
    const withEmail = { ...settings, myMemoryEmail: "ana@example.com" };
    await service.lookup("eat", "en", withEmail);
    await service.lookup(phrase, "fr", withEmail);
    await settle();
    expect(storage.keys().length).toBeGreaterThan(1);
    expect(storage.dump()).not.toContain("example.com");
  });

  it("still looks things up when storage fails or holds something unexpected", async () => {
    const { fn } = fakeFetch(words);
    const broken = {
      get: () => Promise.reject(new Error("unavailable")),
      set: () => Promise.reject(new Error("QUOTA_BYTES quota exceeded")),
      remove: () => Promise.reject(new Error("unavailable")),
    };
    const result = await createLookupService(fn, broken).lookup("eat", "en", settings);
    expect(result.kind === "translate" && result.first?.outcome.ok).toBe(true);

    const storage = fakeStorage();
    await createLookupService(fn, storage.area).lookup("manger", "fr", settings);
    await settle();
    for (const key of storage.keys().filter((k) => k !== "lookup:index")) {
      storage.data.set(key, JSON.stringify({ version: 1, savedAt: Date.now(), value: { kind: "something else" } }));
    }
    const again = await (await restart(storage, fn)).lookup("manger", "fr", settings);
    expect(again.kind === "explain" && again.entries.length).toBeGreaterThan(0);
  });
});
