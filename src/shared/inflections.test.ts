import { describe, expect, it } from "vitest";
import { entry } from "../test/fixtures";
import { buildInflections, tableContains, type InflectionTable } from "./inflections";
import type { Entry } from "./types";

const table = (tables: InflectionTable[], title: string) => {
  const t = tables.find((x) => x.title === title);
  if (!t) throw new Error(`no table "${title}" in: ${tables.map((x) => x.title).join(" | ")}`);
  return t;
};
const cell = (t: InflectionTable, row: string, col: string) => t.cells[row]?.[col];

describe("verb conjugation", () => {
  const { tables, other } = buildInflections(entry("french-manger", "verb"), "fr");
  const present = table(tables, "Indicative present");

  it("lays out person against number", () => {
    expect(present.rowHeading).toBe("Person");
    expect(present.rows.map((r) => r.label)).toEqual(["1st person", "2nd person", "3rd person"]);
    expect(present.columns.map((c) => c.label)).toEqual(["Singular", "Plural"]);
    expect(cell(present, "first-person", "singular")?.forms).toEqual(["mange"]);
    expect(cell(present, "first-person", "plural")?.forms).toEqual(["mangeons"]);
    expect(cell(present, "third-person", "plural")?.forms).toEqual(["mangent"]);
  });

  it("shows subject pronouns", () => {
    expect(cell(present, "first-person", "singular")?.pronoun).toBe("je");
    expect(cell(present, "second-person", "plural")?.pronoun).toBe("vous");
  });

  it("gives every tense and mood its own table", () => {
    const titles = tables.map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining([
      "Indicative imperfect",
      "Indicative simple past",
      "Indicative future",
      "Conditional",
      "Subjunctive present",
      "Imperative",
    ]));
  });

  it("leaves pronouns off the imperative", () => {
    const imperative = table(tables, "Imperative");
    expect(Object.values(imperative.cells).flatMap(Object.values).every((c) => !c.pronoun)).toBe(true);
  });

  it("lists non-finite forms separately", () => {
    expect(other).toContainEqual({ label: "Infinitive", forms: ["manger"] });
    expect(other).toContainEqual({ label: "Present participle", forms: ["mangeant"] });
    expect(other).toContainEqual({ label: "Past participle", forms: ["mangé"] });
  });

  it("elides je before a vowel", () => {
    const aimer: Entry = {
      word: "aimer", pos: "verb", senses: [], formOf: [], translations: [],
      forms: [{ form: "aime", tags: ["first-person", "singular", "present", "indicative"], fromTable: true }],
    };
    const t = buildInflections(aimer, "fr").tables[0]!;
    expect(cell(t, "first-person", "singular")?.pronoun).toBe("j’");
  });

  it("never gives vos forms a table of their own", () => {
    const comer = buildInflections(entry("spanish-comer", "verb"), "es", { spanishVariety: "rioplatense" });
    expect(comer.tables.some((t) => /vos|informal/.test(t.title))).toBe(false);
  });

  it("names the Spanish -se imperfect subjunctive without repeating itself", () => {
    const titles = buildInflections(entry("spanish-comer", "verb"), "es").tables.map((t) => t.title);
    expect(titles).toContain("Subjunctive imperfect (-se)");
  });

  it("gives the past participle its own gender and number table", () => {
    const participle = table(buildInflections(entry("spanish-comer", "verb"), "es").tables, "Past participle");
    expect(cell(participle, "", "feminine plural")?.forms).toEqual(["comidas"]);
  });
});

describe("Spanish varieties", () => {
  const comer = entry("spanish-comer", "verb");
  const present = (variety: "spain" | "latin-america" | "rioplatense") =>
    table(buildInflections(comer, "es", { spanishVariety: variety }).tables, "Indicative present");

  it("Spain: tú and vosotros, without vos forms", () => {
    const t = present("spain");
    expect(cell(t, "second-person", "singular")).toEqual({ forms: ["comes"], pronoun: "tú" });
    expect(cell(t, "second-person", "plural")).toEqual({ forms: ["coméis"], pronoun: "vosotros" });
    expect(cell(t, "third-person", "plural")?.pronoun).toBe("ellos/ellas/ustedes");
  });

  it("Latin America: ustedes takes the third-person plural form, and vosotros is gone", () => {
    const t = present("latin-america");
    expect(cell(t, "second-person", "singular")).toEqual({ forms: ["comes"], pronoun: "tú" });
    expect(cell(t, "second-person", "plural")).toEqual({ forms: ["comen"], pronoun: "ustedes" });
    expect(cell(t, "third-person", "plural")?.pronoun).toBe("ellos/ellas");
  });

  it("Río de la Plata: vos has its own present form", () => {
    const t = present("rioplatense");
    expect(cell(t, "second-person", "singular")).toEqual({ forms: ["comés"], pronoun: "vos" });
    expect(cell(t, "second-person", "plural")).toEqual({ forms: ["comen"], pronoun: "ustedes" });
  });

  it("Río de la Plata: vos shares tú's form in tenses without a vos form", () => {
    const tables = buildInflections(comer, "es", { spanishVariety: "rioplatense" }).tables;
    expect(cell(table(tables, "Indicative preterite"), "second-person", "singular")).toEqual({ forms: ["comiste"], pronoun: "vos" });
    expect(cell(table(tables, "Imperative"), "second-person", "singular")?.forms).toEqual(["comé"]);
  });

  it("Latin America: the ustedes imperative is the formal plural", () => {
    const tables = buildInflections(comer, "es", { spanishVariety: "latin-america" }).tables;
    expect(cell(table(tables, "Imperative"), "second-person", "plural")?.forms).toEqual(["coman"]);
  });
});

describe("Greek", () => {
  const grafo = buildInflections(entry("greek-grafo", "verb"), "el");

  it("names tenses by tense and aspect, voice first", () => {
    expect(grafo.tables.map((t) => t.title)).toEqual(expect.arrayContaining([
      "Active present",
      "Active imperfect (continuous past)",
      "Active simple past (aorist)",
      "Active future continuous",
      "Active simple future",
      "Active dependent (after να, θα)",
      "Passive present",
      "Active imperative, simple",
    ]));
  });

  it("keeps future forms built with θα", () => {
    const future = table(grafo.tables, "Active simple future");
    expect(cell(future, "first-person", "singular")).toEqual({ forms: ["θα γράψω"], pronoun: "εγώ" });
  });

  it("conjugates with Greek subject pronouns", () => {
    const aorist = table(grafo.tables, "Active simple past (aorist)");
    expect(cell(aorist, "first-person", "singular")).toEqual({ forms: ["έγραψα"], pronoun: "εγώ" });
    expect(cell(aorist, "third-person", "plural")?.pronoun).toBe("αυτοί/αυτές/αυτά");
  });

  it("declines nouns by case and number, including the vocative", () => {
    const t = buildInflections(entry("greek-spiti", "noun"), "el").tables[0]!;
    expect(t.rows.map((r) => r.key)).toEqual(["nominative", "genitive", "accusative", "vocative"]);
    expect(cell(t, "genitive", "singular")?.forms).toEqual(["σπιτιού"]);
    expect(cell(t, "genitive", "plural")?.forms).toEqual(["σπιτιών"]);
  });

  it("declines adjectives by case, gender and number", () => {
    const t = buildInflections(entry("greek-kalos", "adj"), "el").tables[0]!;
    expect(cell(t, "nominative", "feminine singular")?.forms).toEqual(["καλή"]);
    expect(cell(t, "nominative", "neuter plural")?.forms).toEqual(["καλά"]);
    expect(cell(t, "genitive", "masculine singular")?.forms).toEqual(["καλού"]);
  });
});

describe("adjective agreement", () => {
  it("shows masculine and feminine, singular and plural, including the lemma", () => {
    const { tables } = buildInflections(entry("spanish-bonito", "adj"), "es");
    expect(tables).toHaveLength(1);
    const t = tables[0]!;
    expect(t.columns.map((c) => c.label)).toEqual([
      "Masculine singular", "Masculine plural", "Feminine singular", "Feminine plural",
    ]);
    expect(cell(t, "", "masculine singular")?.forms).toEqual(["bonito"]);
    expect(cell(t, "", "feminine singular")?.forms).toEqual(["bonita"]);
    expect(cell(t, "", "masculine plural")?.forms).toEqual(["bonitos"]);
    expect(cell(t, "", "feminine plural")?.forms).toEqual(["bonitas"]);
  });

  it("puts a before-vowel form beside the ordinary one", () => {
    const beau: Entry = {
      word: "beau", pos: "adj", senses: [], formOf: [], translations: [],
      forms: [
        { form: "bel", tags: ["before-vowel", "masculine", "singular"], fromTable: false },
        { form: "belle", tags: ["feminine"], fromTable: false },
        { form: "beaux", tags: ["masculine", "plural"], fromTable: false },
        { form: "belles", tags: ["feminine", "plural"], fromTable: false },
      ],
    };
    const { tables } = buildInflections(beau, "fr");
    expect(tables).toHaveLength(1);
    expect(cell(tables[0]!, "", "masculine singular")?.forms).toEqual(["beau", "bel"]);
  });

  it("declines German adjectives by case, gender and number, per declension type", () => {
    const { tables, other } = buildInflections(entry("german-schoen", "adj"), "de");
    const strong = table(tables, "Strong (no article)");
    expect(strong.rowHeading).toBe("Case");
    expect(strong.rows.map((r) => r.key)).toEqual(["nominative", "genitive", "dative", "accusative"]);
    expect(cell(strong, "nominative", "masculine singular")?.forms).toEqual(["schöner"]);
    expect(cell(strong, "dative", "neuter singular")?.forms).toEqual(["schönem"]);
    expect(cell(table(tables, "Weak (after a definite article)"), "nominative", "feminine singular")?.forms)
      .toEqual(["die schöne"]);
    expect(tables.map((t) => t.title)).toEqual(expect.arrayContaining([
      "Comparative predicative", "Comparative strong (no article)", "Superlative predicative",
    ]));
    expect(tables.some((t) => t.title.includes("negative"))).toBe(false);
    // The head line's comparative "schöner" is already in the comparative tables.
    expect(other).toEqual([]);
  });
});

describe("Māori", () => {
  it("shows an irregular plural beside the singular", () => {
    const t = buildInflections(entry("maori-tamaiti", "noun"), "mi").tables;
    expect(t).toHaveLength(1);
    expect(cell(t[0]!, "", "singular")?.forms).toEqual(["tamaiti"]);
    expect(cell(t[0]!, "", "plural")?.forms).toEqual(["tamariki"]);
  });

  it("lists a verb's passive as another form, since verbs don't conjugate by person", () => {
    const { tables, other } = buildInflections(entry("maori-kai", "verb"), "mi");
    expect(tables).toEqual([]);
    expect(other).toContainEqual({ label: "Passive", forms: ["kainga"] });
  });
});

describe("noun declension", () => {
  const { tables, other } = buildInflections(entry("german-haus", "noun"), "de");

  it("lays out case against number", () => {
    expect(tables).toHaveLength(1);
    const t = tables[0]!;
    expect(cell(t, "nominative", "plural")?.forms).toEqual(["Häuser"]);
    expect(cell(t, "dative", "singular")?.forms).toEqual(["Haus", "Hause"]);
    expect(cell(t, "dative", "plural")?.forms).toEqual(["Häusern"]);
  });

  it("lists head-line forms that aren't in the table, like diminutives", () => {
    expect(other.find((o) => o.label.startsWith("Diminutive"))?.forms).toContain("Häuschen");
    expect(other.flatMap((o) => o.forms)).not.toContain("Häuser");
  });

  it("adds the lemma as the singular when only the plural is listed", () => {
    const t = buildInflections(entry("spanish-bonito", "noun"), "es").tables[0]!;
    expect(cell(t, "", "singular")?.forms).toEqual(["bonito"]);
    expect(cell(t, "", "plural")?.forms).toEqual(["bonitos"]);
  });
});

describe("tableContains", () => {
  it("finds the selected form regardless of case", () => {
    const { tables } = buildInflections(entry("french-manger", "verb"), "fr");
    expect(tableContains(table(tables, "Indicative imperfect"), "Mangeait")).toBe(true);
    expect(tableContains(table(tables, "Indicative present"), "mangeait")).toBe(false);
  });
});
