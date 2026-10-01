import { describe, expect, it } from "vitest";
import { parseKaikki } from "../shared/kaikki";
import { fixture } from "../test/fixtures";
import { explain, glossesMention, leadTranslation, limitSenses, machineCandidates, preferMachineChoice, sensesFor, translate } from "./lookup";

type Route = (url: URL) => Response | undefined;

/**
 * A fetch that serves kaikki fixtures by "Language/word" and a canned MyMemory
 * reply ("<target>(<text>)"), and records what was requested.
 */
function fakeFetch(opts: { words?: Record<string, string>; translation?: Route | "fail"; kaikki?: "fail" } = {}) {
  const requested: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "kaikki.org") {
      const parts = url.pathname.split("/").map(decodeURIComponent);
      const key = `${parts[2]}/${parts.at(-1)!.replace(/\.jsonl$/, "")}`;
      requested.push(key);
      if (opts.kaikki === "fail") return new Response("", { status: 503 });
      const name = opts.words?.[key];
      return name ? new Response(fixture(name)) : new Response("", { status: 404 });
    }
    requested.push(`MyMemory ${url.searchParams.get("langpair")} ${url.searchParams.get("q")}`);
    if (opts.translation === "fail") return new Response("", { status: 500 });
    const target = url.searchParams.get("langpair")!.split("|")[1];
    return opts.translation?.(url) ?? Response.json({
      responseStatus: 200,
      responseData: { translatedText: `${target}(${url.searchParams.get("q")})` },
    });
  }) as typeof fetch;
  return { fn, requested };
}

describe("explain: a word in a language being learned", () => {
  it("returns the inflected form, its lemma, and a translation into the user's language", async () => {
    const { fn } = fakeFetch({ words: { "French/mange": "french-mange", "French/manger": "french-manger" } });
    const result = await explain({ text: "mange", lang: "fr", target: "en", fetchFn: fn });
    expect(result.kind).toBe("explain");
    expect(result.entries[0]?.formOf[0]?.lemma).toBe("manger");
    expect(result.lemmas.map((e) => e.pos)).toEqual(["verb", "noun"]);
    expect(result.translation).toEqual({ text: "en(mange)", provider: "MyMemory" });
    expect(result.warnings).toEqual([]);
  });

  it("tries lower case when a sentence-initial word isn't found", async () => {
    const { fn, requested } = fakeFetch({ words: { "French/mange": "french-mange" } });
    const result = await explain({ text: "Mange", lang: "fr", target: "en", fetchFn: fn });
    expect(requested.filter((r) => r.startsWith("French/")).slice(0, 2)).toEqual(["French/Mange", "French/mange"]);
    expect(result.entries).not.toHaveLength(0);
  });

  it("still returns the dictionary entry when translation fails", async () => {
    const { fn } = fakeFetch({ words: { "Spanish/bonito": "spanish-bonito" }, translation: "fail" });
    const result = await explain({ text: "bonito", lang: "es", target: "en", fetchFn: fn });
    expect(result.entries.map((e) => e.pos)).toEqual(["adj", "noun"]);
    expect(result.translation).toBeUndefined();
    expect(result.warnings).toEqual(["Translation unavailable: MyMemory responded 500"]);
  });

  it("still translates when the dictionary is down", async () => {
    const { fn } = fakeFetch({ kaikki: "fail" });
    const result = await explain({ text: "bonito", lang: "es", target: "en", fetchFn: fn });
    expect(result.translation?.text).toBe("en(bonito)");
    expect(result.warnings).toEqual(["Dictionary unavailable: kaikki.org responded 503"]);
  });

  it("fails when both providers fail", async () => {
    const { fn } = fakeFetch({ kaikki: "fail", translation: "fail" });
    await expect(explain({ text: "bonito", lang: "es", target: "en", fetchFn: fn })).rejects.toThrow(/Dictionary unavailable/);
  });

  it("only translates long phrases", async () => {
    const { fn, requested } = fakeFetch();
    const result = await explain({ text: "je voudrais manger une pomme", lang: "fr", target: "en", fetchFn: fn });
    expect(requested.every((r) => r.startsWith("MyMemory"))).toBe(true);
    expect(result.translation?.text).toBe("en(je voudrais manger une pomme)");
  });

  it("rejects languages it has no dictionary name for", async () => {
    await expect(explain({ text: "x", lang: "tlh", target: "en", fetchFn: fakeFetch().fn })).rejects.toThrow(/Unsupported/);
  });
});

describe("translate: a word or phrase in the user's language", () => {
  const words = {
    "English/eat": "english-eat",
    "English/ate": "english-ate",
    "English/house": "english-house",
    "English/beautiful": "english-beautiful",
    "French/manger": "french-manger",
    "French/maison": "french-maison",
    "French/beau": "french-beau",
    "Spanish/comer": "spanish-comer",
    "Greek/τρώω": "greek-troo",
  };

  it("gives each learning language its dictionary translations and the main one's forms", async () => {
    const { fn, requested } = fakeFetch({ words });
    const result = await translate({ text: "eat", from: "en", targets: ["fr", "es", "el"], fetchFn: fn });
    expect(result.kind).toBe("translate");
    expect(result.languages.map((l) => [l.lang, l.lead, l.entry?.word, l.entry?.pos])).toEqual([
      ["fr", "manger", "manger", "verb"],
      ["es", "comer", "comer", "verb"],
      ["el", "τρώω", "τρώω", "verb"],
    ]);
    expect(result.languages[0]?.senses[0]?.words.map((w) => w.word)).toContain("manger");
    // Machine translation only breaks ties between dictionary words; it isn't shown.
    expect(requested.filter((r) => r.startsWith("MyMemory"))).toHaveLength(3);
    expect(result.languages.every((l) => l.machine === undefined)).toBe(true);
  });

  it("follows an inflected English word to its lemma's translations", async () => {
    const { fn } = fakeFetch({ words });
    const result = await translate({ text: "ate", from: "en", targets: ["es"], fetchFn: fn });
    expect(result.source).toEqual({ lemma: "eat", description: "simple past" });
    expect(result.languages[0]?.lead).toBe("comer");
  });

  it("uses a word's own translations, not those of a word it's a rare form of", async () => {
    // Wiktionary lists "book" as a dialect past tense of "bake".
    const { fn } = fakeFetch({ words: { ...words, "English/book": "english-book", "English/bake": "english-bake" } });
    const result = await translate({ text: "book", from: "en", targets: ["es"], fetchFn: fn });
    expect(result.source).toBeUndefined();
    expect(result.languages[0]?.lead).toBe("libro");
  });

  it("lets machine translation pick the common word among the dictionary's", async () => {
    const { fn } = fakeFetch({
      words,
      translation: () => Response.json({ responseStatus: 200, responseData: { translatedText: "morfar" } }),
    });
    const result = await translate({ text: "eat", from: "en", targets: ["es"], fetchFn: fn });
    expect(result.languages[0]?.lead).toBe("morfar");
    expect(result.languages[0]?.senses[0]?.words[0]?.word).toBe("morfar");
  });

  it("leads with the machine's word when the dictionary lacks it, if that word's own entry confirms the meaning", async () => {
    // Wiktionary's Spanish translations of "teacher" are enseñador/a and enseñante; it lacks profesor.
    const { fn } = fakeFetch({
      words: { "English/teacher": "english-teacher", "Spanish/profesor": "spanish-profesor" },
      translation: () => Response.json({ responseStatus: 200, responseData: { translatedText: "profesor" } }),
    });
    const result = await translate({ text: "teacher", from: "en", targets: ["es"], fetchFn: fn });
    expect(result.languages[0]?.lead).toBe("profesor");
    expect(result.languages[0]?.senses[0]).toMatchObject({ sense: "usual translation", words: [{ word: "profesor" }] });
    expect(result.languages[0]?.senses[1]?.words[0]?.word).toBe("enseñador");
  });

  it("ignores the machine's word when its entry doesn't confirm the meaning", async () => {
    const { fn } = fakeFetch({
      words: { "English/teacher": "english-teacher", "Spanish/comer": "spanish-comer" },
      translation: () => Response.json({ responseStatus: 200, responseData: { translatedText: "comer" } }),
    });
    const result = await translate({ text: "teacher", from: "en", targets: ["es"], fetchFn: fn });
    expect(result.languages[0]?.lead).toBe("enseñador");
  });

  it("translates a verb form through its base verb, not the base word's noun", async () => {
    const { fn } = fakeFetch({ words });
    const result = await translate({ text: "ate", from: "en", targets: ["es"], fetchFn: fn });
    expect(result.languages[0]?.senses[0]?.pos).toBe("verb");
  });

  it("shows a noun's gender with its translation", async () => {
    const { fn } = fakeFetch({ words });
    const result = await translate({ text: "house", from: "en", targets: ["fr"], fetchFn: fn });
    expect(result.languages[0]?.senses[0]?.words[0]).toEqual({ word: "maison", tags: ["feminine"] });
    expect(result.languages[0]?.entry?.word).toBe("maison");
  });

  it("machine-translates phrases into each language", async () => {
    const { fn, requested } = fakeFetch({ words });
    const result = await translate({ text: "I would like to eat something", from: "en", targets: ["fr", "es"], fetchFn: fn });
    expect(result.languages.map((l) => l.machine)).toEqual(["fr(I would like to eat something)", "es(I would like to eat something)"]);
    expect(result.languages.every((l) => l.senses.length === 0 && !l.entry)).toBe(true);
    expect(requested.some((r) => r.startsWith("English/"))).toBe(false);
  });

  it("falls back to machine translation for a word the dictionary can't translate, and looks that up", async () => {
    const { fn } = fakeFetch({ words: { "French/manger": "french-manger" }, translation: () => Response.json({ responseStatus: 200, responseData: { translatedText: "manger" } }) });
    const result = await translate({ text: "chow", from: "en", targets: ["fr"], fetchFn: fn });
    expect(result.languages[0]).toMatchObject({ machine: "manger", lead: "manger" });
    expect(result.languages[0]?.entry?.word).toBe("manger");
  });

  it("machine-translates an inflected word's base form, and prefers a candidate of the same part of speech", async () => {
    // The fixture keeps no Italian translations, so Italian falls back to MyMemory.
    // Its first answer is an adjective; an alternative is the verb. (Spanish
    // fixtures stand in for Italian entries: only their shape matters here.)
    const { fn, requested } = fakeFetch({
      words: {
        "English/ate": "english-ate",
        "English/eat": "english-eat",
        "Italian/bonito": "spanish-bonito",
        "Italian/comer": "spanish-comer",
      },
      translation: () => Response.json({
        responseStatus: 200,
        responseData: { translatedText: "bonito" },
        matches: [{ translation: "bonito" }, { translation: "comer" }],
      }),
    });
    const result = await translate({ text: "ate", from: "en", targets: ["it"], fetchFn: fn });
    expect(requested).toContain("MyMemory en|it eat");
    expect(result.languages[0]).toMatchObject({ machine: "bonito", machineOf: "eat", lead: "comer" });
    expect(result.languages[0]?.entry?.pos).toBe("verb");
  });

  it("names the machine translation as the word to look up when no candidate is in the dictionary", async () => {
    const { fn } = fakeFetch({
      words: { "English/eat": "english-eat" },
      translation: () => Response.json({ responseStatus: 200, responseData: { translatedText: "mangiare" } }),
    });
    const result = await translate({ text: "eat", from: "en", targets: ["it"], fetchFn: fn });
    expect(result.languages[0]).toMatchObject({ machine: "mangiare", lead: "mangiare" });
    expect(result.languages[0]?.entry).toBeUndefined();
  });

  it("uses machine translation when the user's language isn't English, which has no translation tables", async () => {
    const { fn, requested } = fakeFetch();
    const result = await translate({ text: "comer", from: "es", targets: ["fr"], fetchFn: fn });
    expect(result.languages[0]?.machine).toBe("fr(comer)");
    expect(requested).not.toContain("Spanish/comer");
  });

  it("reports one language failing without failing the others", async () => {
    const { fn } = fakeFetch({ words: { "English/eat": "english-eat" } });
    const result = await translate({ text: "eat", from: "en", targets: ["fr", "es"], fetchFn: fn });
    // The dictionary has translations for both, though their own entries aren't available.
    expect(result.languages.map((l) => l.lead)).toEqual(["manger", "comer"]);
    expect(result.languages.every((l) => !l.entry)).toBe(true);
  });

  it("fails when no language could be translated", async () => {
    const { fn } = fakeFetch({ kaikki: "fail", translation: "fail" });
    await expect(translate({ text: "eat", from: "en", targets: ["fr"], fetchFn: fn })).rejects.toThrow(/Translation unavailable/);
  });
});

describe("glossesMention", () => {
  const entry = (gloss: string) => ({ word: "x", pos: "noun", senses: [{ gloss, tags: [] }], forms: [], formOf: [], translations: [] });

  it("finds the English word as a whole word in a definition", () => {
    expect(glossesMention(entry("teacher, professor"), "teacher")).toBe(true);
    expect(glossesMention(entry("Teacher"), "teacher")).toBe(true);
  });

  it("doesn't match inside another word", () => {
    expect(glossesMention(entry("preacher"), "teacher")).toBe(false);
    expect(glossesMention(entry("to eat"), "eat")).toBe(true);
    expect(glossesMention(entry("to beat"), "eat")).toBe(false);
  });
});

describe("machineCandidates", () => {
  it("tries the translation, then alternatives, then the words of short phrases", () => {
    expect(machineCandidates({ text: "για αναδημοσίευση", alternatives: ["Αναδημοσιεύση", "a very long sentence that is not a word at all"] }))
      .toEqual(["Αναδημοσιεύση", "για αναδημοσίευση".split(" ")[1], "για αναδημοσίευση"]);
  });

  it("drops punctuation", () => {
    expect(machineCandidates({ text: "¡republicar!", alternatives: [] })).toEqual(["republicar"]);
  });
});

describe("preferMachineChoice", () => {
  const senses = [
    { pos: "verb", sense: "to leave behind", words: [{ word: "dejar", tags: [] }, { word: "olvidar", tags: [] }] },
    { pos: "verb", sense: "to lose remembrance of", words: [{ word: "olvidar", tags: [] }, { word: "olvidarse", tags: [] }] },
  ];

  it("leads with the dictionary word the machine translation names, and moves its meaning first", () => {
    const { senses: out, lead } = preferMachineChoice(senses.slice().reverse(), { text: "Olvidar", alternatives: [] });
    expect(lead).toEqual({ word: "olvidar", pos: "verb" });
    expect(out[0]?.sense).toBe("to lose remembrance of");
  });

  it("puts the chosen word first within its meaning", () => {
    const { senses: out } = preferMachineChoice(senses, { text: "olvidar", alternatives: [] });
    expect(out[0]?.words.map((w) => w.word)).toEqual(["olvidar", "dejar"]);
  });

  it("checks MyMemory's alternatives too", () => {
    expect(preferMachineChoice(senses, { text: "olvido", alternatives: ["olvidarse"] }).lead?.word).toBe("olvidarse");
  });

  it("changes nothing when the machine translation isn't among the dictionary's words", () => {
    expect(preferMachineChoice(senses, { text: "abandonar", alternatives: [] })).toEqual({ senses });
    expect(preferMachineChoice(senses, undefined)).toEqual({ senses });
  });
});

describe("sensesFor and leadTranslation", () => {
  const eat = parseKaikki(fixture("english-eat"), { translationsInto: ["es", "fr"] });

  it("groups translations by meaning and drops obsolete ones", () => {
    const senses = sensesFor(eat, "es");
    expect(senses[0]?.sense).toBe("to ingest");
    expect(senses.flatMap((s) => s.words).every((w) => !w.tags.includes("obsolete"))).toBe(true);
    expect(limitSenses(senses).length).toBeLessThanOrEqual(4);
    expect(limitSenses(senses).every((s) => s.words.length <= 4)).toBe(true);
  });

  it("prefers a translation with no regional or register label", () => {
    expect(leadTranslation(sensesFor(eat, "es"))?.word).toBe("comer");
    expect(leadTranslation([{ pos: "verb", sense: "x", words: [
      { word: "jamear", tags: ["South-America"] },
      { word: "comer", tags: [] },
    ] }])?.word).toBe("comer");
  });

  it("treats gender as grammar, not a usage label", () => {
    expect(leadTranslation([{ pos: "noun", sense: "x", words: [{ word: "maison", tags: ["feminine"] }] }])?.word).toBe("maison");
  });
});
