import { describe, expect, it } from "vitest";
import { entry, fixture } from "../test/fixtures";
import { kaikkiUrl, parseKaikki } from "./kaikki";

describe("kaikkiUrl", () => {
  it("shards by the first one and two characters", () => {
    expect(kaikkiUrl("French", "manger")).toBe("https://kaikki.org/dictionary/French/meaning/m/ma/manger.jsonl");
  });

  it("handles one-letter words and accented initials", () => {
    expect(kaikkiUrl("French", "a")).toBe("https://kaikki.org/dictionary/French/meaning/a/a/a.jsonl");
    expect(kaikkiUrl("French", "été")).toBe(
      "https://kaikki.org/dictionary/French/meaning/%C3%A9/%C3%A9t/%C3%A9t%C3%A9.jsonl",
    );
  });

  it("encodes language names with diacritics", () => {
    expect(kaikkiUrl("Māori", "whare")).toBe("https://kaikki.org/dictionary/M%C4%81ori/meaning/w/wh/whare.jsonl");
  });

  it("recognises a Māori plural as a form of its singular", () => {
    expect(entry("maori-tamariki", "noun").formOf[0]).toMatchObject({ lemma: "tamaiti" });
  });

  it("encodes multi-word language names", () => {
    expect(kaikkiUrl("Norwegian Bokmål", "hus")).toContain("/Norwegian%20Bokm%C3%A5l/meaning/h/hu/hus.jsonl");
  });
});

describe("parseKaikki", () => {
  it("reads one entry per part of speech", () => {
    expect(parseKaikki(fixture("french-manger")).map((e) => e.pos)).toEqual(["verb", "noun"]);
  });

  it("reads glosses, pronunciation and audio", () => {
    const verb = entry("french-manger", "verb");
    expect(verb.senses[0]?.gloss).toBe("to eat");
    expect(verb.senses[0]?.example?.translation).toBe("I ate some meat for lunch.");
    expect(verb.ipa).toBe("/mɑ̃.ʒe/");
    expect(verb.audioUrl).toMatch(/^https:\/\/.*\.mp3$/);
  });

  it("drops pronunciation rows that wiktextract mistakes for forms", () => {
    const forms = entry("french-manger", "verb").forms.map((f) => f.form);
    expect(forms).toContain("mange");
    expect(forms).not.toContain("mɑ̃ʒ");
  });

  it("keeps Greek forms containing θ, β or χ, which IPA also uses", () => {
    const forms = entry("greek-grafo", "verb").forms.map((f) => f.form);
    expect(forms).toContain("θα γράψω");
    const synthetic = parseKaikki(JSON.stringify({
      word: "αγαπώ", pos: "verb", senses: [{ glosses: ["to love"] }],
      forms: [{ form: "αγαπήθηκα", tags: ["past"] }, { form: "βρέχω", tags: ["x"] }, { form: "έχω", tags: ["y"] }],
    }));
    expect(synthetic[0]?.forms.map((f) => f.form)).toEqual(["αγαπήθηκα", "βρέχω", "έχω"]);
  });

  it("drops romanisations", () => {
    expect(entry("greek-grafo", "verb").forms.map((f) => f.form)).not.toContain("gráfo");
  });

  it("drops table bookkeeping and periphrastic constructions", () => {
    const forms = entry("french-manger", "verb").forms.map((f) => f.form);
    expect(forms).not.toContain("fr-conj-auto");
    expect(forms).not.toContain("avoir + past participle");
  });

  it("drops verb-plus-clitic combinations", () => {
    const comer = entry("spanish-comer", "verb");
    expect(comer.forms.some((f) => f.tags.includes("combined-form"))).toBe(false);
  });

  it("recognises an inflected form and names its lemma", () => {
    const mange = entry("french-mange", "verb");
    expect(mange.senses).toEqual([]);
    expect(mange.formOf).toContainEqual(expect.objectContaining({
      lemma: "manger",
      description: "first/third-person singular present indicative/subjunctive",
    }));
  });

  it("strips the trailing 'of <lemma>' from form descriptions", () => {
    expect(entry("spanish-comia", "verb").formOf[0]).toMatchObject({
      lemma: "comer",
      description: "first/third-person singular imperfect indicative",
    });
  });

  it("strips a romanised lemma from form descriptions", () => {
    expect(entry("greek-egrapsa", "verb").formOf[0]).toMatchObject({
      lemma: "γράφω",
      description: "first-person singular simple past",
    });
  });

  it("keeps translations only into the languages asked for, in Wiktionary's order", () => {
    const eat = parseKaikki(fixture("english-eat"), { translationsInto: ["es", "el"] }).find((e) => e.pos === "verb")!;
    expect(new Set(eat.translations.map((t) => t.lang))).toEqual(new Set(["es", "el"]));
    expect(eat.translations.find((t) => t.lang === "es")).toMatchObject({ word: "comer", sense: "to ingest" });
  });

  it("keeps translations' gender and romanisation", () => {
    const house = parseKaikki(fixture("english-house"), { translationsInto: ["fr", "el"] }).find((e) => e.pos === "noun")!;
    expect(house.translations.find((t) => t.lang === "fr")).toMatchObject({ word: "maison", tags: ["feminine"] });
    expect(house.translations.find((t) => t.lang === "el")).toMatchObject({ word: "σπίτι", roman: "spíti" });
  });

  it("keeps no translations unless asked", () => {
    expect(parseKaikki(fixture("english-eat")).every((e) => e.translations.length === 0)).toBe(true);
  });

  it("keeps a form's labels, so rare forms can be told apart", () => {
    const book = parseKaikki(fixture("english-book")).flatMap((e) => e.formOf);
    expect(book).toContainEqual(expect.objectContaining({ lemma: "bake", tags: expect.arrayContaining(["dialectal"]) }));
  });

  it("treats an alternative form like an inflected one, so its main spelling is fetched", () => {
    expect(entry("greek-xechno", "verb").formOf).toEqual([{ lemma: "ξεχνάω", description: "alternative form" }]);
  });

  it("marks which forms came from an inflection table", () => {
    const haus = entry("german-haus", "noun");
    expect(haus.forms.find((f) => f.form === "Häuschen")?.fromTable).toBe(false);
    expect(haus.forms.find((f) => f.form === "Häusern")?.fromTable).toBe(true);
  });

  it("skips malformed lines instead of failing the lookup", () => {
    const good = fixture("spanish-comia").trim();
    expect(parseKaikki(`{"broken\n${good}\n`)).toHaveLength(1);
  });
});
