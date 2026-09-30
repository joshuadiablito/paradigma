import { describe, expect, it } from "vitest";
import { fixture } from "../test/fixtures";
import { lookUp } from "./lookup";

type Route = (url: URL) => Response | undefined;

/** A fetch that serves kaikki fixtures by word and a canned MyMemory reply, and records requests. */
function fakeFetch(opts: { words?: Record<string, string>; translation?: Route | "fail"; kaikki?: "fail" } = {}) {
  const requested: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requested.push(decodeURIComponent(url.pathname.split("/").pop() ?? "") || url.search);
    if (url.hostname === "kaikki.org") {
      if (opts.kaikki === "fail") return new Response("", { status: 503 });
      const word = decodeURIComponent(url.pathname.split("/").pop()!.replace(/\.jsonl$/, ""));
      const name = opts.words?.[word];
      return name ? new Response(fixture(name)) : new Response("", { status: 404 });
    }
    if (opts.translation === "fail") return new Response("", { status: 500 });
    return opts.translation?.(url) ?? Response.json({
      responseStatus: 200,
      responseData: { translatedText: `EN(${url.searchParams.get("q")})` },
    });
  }) as typeof fetch;
  return { fn, requested };
}

describe("lookUp", () => {
  it("returns the inflected form, its lemma, and a translation", async () => {
    const { fn } = fakeFetch({ words: { mange: "french-mange", manger: "french-manger" } });
    const result = await lookUp({ text: "mange", lang: "fr", target: "en", fetchFn: fn });
    expect(result.entries[0]?.formOf[0]?.lemma).toBe("manger");
    expect(result.lemmas.map((e) => e.pos)).toEqual(["verb", "noun"]);
    expect(result.translation).toEqual({ text: "EN(mange)", provider: "MyMemory" });
    expect(result.warnings).toEqual([]);
  });

  it("tries lower case when a sentence-initial word isn't found", async () => {
    const { fn, requested } = fakeFetch({ words: { mange: "french-mange" } });
    const result = await lookUp({ text: "Mange", lang: "fr", target: "en", fetchFn: fn });
    expect(requested.filter((r) => r.endsWith(".jsonl")).slice(0, 2)).toEqual(["Mange.jsonl", "mange.jsonl"]);
    expect(result.entries).not.toHaveLength(0);
  });

  it("still returns the dictionary entry when translation fails", async () => {
    const { fn } = fakeFetch({ words: { bonito: "spanish-bonito" }, translation: "fail" });
    const result = await lookUp({ text: "bonito", lang: "es", target: "en", fetchFn: fn });
    expect(result.entries.map((e) => e.pos)).toEqual(["adj", "noun"]);
    expect(result.translation).toBeUndefined();
    expect(result.warnings).toEqual(["Translation unavailable: MyMemory responded 500"]);
  });

  it("still translates when the dictionary is down", async () => {
    const { fn } = fakeFetch({ kaikki: "fail" });
    const result = await lookUp({ text: "bonito", lang: "es", target: "en", fetchFn: fn });
    expect(result.translation?.text).toBe("EN(bonito)");
    expect(result.warnings).toEqual(["Dictionary unavailable: kaikki.org responded 503"]);
  });

  it("fails when both providers fail", async () => {
    const { fn } = fakeFetch({ kaikki: "fail", translation: "fail" });
    await expect(lookUp({ text: "bonito", lang: "es", target: "en", fetchFn: fn })).rejects.toThrow(/Dictionary unavailable/);
  });

  it("only translates long phrases", async () => {
    const { fn, requested } = fakeFetch();
    const result = await lookUp({ text: "je voudrais manger une pomme", lang: "fr", target: "en", fetchFn: fn });
    expect(requested.some((r) => r.endsWith(".jsonl"))).toBe(false);
    expect(result.translation?.text).toBe("EN(je voudrais manger une pomme)");
  });

  it("does not translate into the language being read", async () => {
    const { fn, requested } = fakeFetch({ words: { Haus: "german-haus" } });
    const result = await lookUp({ text: "Haus", lang: "de", target: "de", fetchFn: fn });
    expect(requested.some((r) => r.startsWith("?"))).toBe(false);
    expect(result.translation).toBeUndefined();
  });

  it("rejects languages it has no dictionary name for", async () => {
    await expect(lookUp({ text: "x", lang: "tlh", target: "en", fetchFn: fakeFetch().fn })).rejects.toThrow(/Unsupported/);
  });
});
