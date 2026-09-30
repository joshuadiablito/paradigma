import { describe, expect, it } from "vitest";
import { isDictionaryCandidate, lookupCandidates, wordAt } from "./word";

describe("wordAt", () => {
  const text = "Je mange une pomme.";

  it("finds the word containing the offset", () => {
    expect(wordAt(text, 4, "fr")).toEqual({ word: "mange", start: 3, end: 8 });
  });

  it("returns null on whitespace and punctuation", () => {
    expect(wordAt(text, 2, "fr")).toBeNull();
    expect(wordAt(text, 18, "fr")).toBeNull();
  });

  it("keeps words with internal apostrophes whole", () => {
    expect(wordAt("C’est aujourd’hui", 10, "fr")?.word).toBe("aujourd’hui");
  });

  it("segments languages written without spaces", () => {
    const w = wordAt("私は猫が好きです", 2, "ja");
    expect(w?.word.length).toBeGreaterThan(0);
    expect(w?.word).not.toBe("私は猫が好きです");
  });
});

describe("lookupCandidates", () => {
  it("tries the word as written, then lower case", () => {
    expect(lookupCandidates("Mange")).toEqual(["Mange", "mange"]);
  });

  it("tries a capitalised form so German nouns are found", () => {
    expect(lookupCandidates("haus")).toEqual(["haus", "Haus"]);
  });

  it("strips elided articles and pronouns", () => {
    expect(lookupCandidates("l’homme").slice(0, 2)).toEqual(["l'homme", "homme"]);
    expect(lookupCandidates("dell’acqua")).toContain("acqua");
  });

  it("does not split words that merely contain an apostrophe late", () => {
    expect(lookupCandidates("aujourd’hui")).not.toContain("hui");
  });

  it("returns nothing for blank text", () => {
    expect(lookupCandidates("   ")).toEqual([]);
  });
});

describe("isDictionaryCandidate", () => {
  it("accepts words and short set phrases", () => {
    expect(isDictionaryCandidate("manger")).toBe(true);
    expect(isDictionaryCandidate("pomme de terre")).toBe(true);
  });

  it("leaves sentences to translation only", () => {
    expect(isDictionaryCandidate("je voudrais une pomme de terre")).toBe(false);
  });
});
