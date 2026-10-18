import { describe, expect, it } from "vitest";
import { isDictionaryCandidate, isTranslatable, lookupCandidates } from "./word";

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

describe("isTranslatable", () => {
  it("accepts words, phrases and sentences", () => {
    for (const text of ["manger", "pomme de terre", "¿Dónde está la estación?", "e.g.", "U.S.A", "l’homme", "3 pommes"]) {
      expect(isTranslatable(text), text).toBe(true);
    }
  });

  it("skips web addresses", () => {
    for (const text of ["https://example.com/a?b=c", "http://localhost:3000", "www.elpais.com", "elpais.com", "es.wikipedia.org/wiki/Gato", "mailto:hola@example.es"]) {
      expect(isTranslatable(text), text).toBe(false);
    }
  });

  it("skips email addresses", () => {
    expect(isTranslatable("maria.garcia@correo.es")).toBe(false);
  });

  it("skips phone numbers and other text without letters", () => {
    for (const text of ["+34 912 345 678", "(555) 123-4567", "0800 123 456", "12/03/2025", "€19,99", "1.000"]) {
      expect(isTranslatable(text), text).toBe(false);
    }
  });
});
