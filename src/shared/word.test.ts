import { describe, expect, it } from "vitest";
import { isDictionaryCandidate, lookupCandidates } from "./word";

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
