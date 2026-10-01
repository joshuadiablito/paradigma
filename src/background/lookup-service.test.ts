import { describe, expect, it } from "vitest";
import { fixture } from "../test/fixtures";
import { createLookupService } from "./lookup-service";

/** Serves kaikki fixtures by "Language/word" and a canned MyMemory reply, recording each request. */
function fakeFetch(words: Record<string, string>) {
  const requested: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "kaikki.org") {
      const parts = url.pathname.split("/").map(decodeURIComponent);
      const key = `${parts[2]}/${parts.at(-1)!.replace(/\.jsonl$/, "")}`;
      requested.push(key);
      const name = words[key];
      return name ? new Response(fixture(name)) : new Response("", { status: 404 });
    }
    requested.push(`MyMemory ${url.searchParams.get("langpair")}`);
    return Response.json({ responseStatus: 200, responseData: { translatedText: "x" } });
  }) as typeof fetch;
  return { fn, requested };
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
