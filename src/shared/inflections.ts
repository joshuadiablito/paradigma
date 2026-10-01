// Pivots wiktextract's flat, tagged form list into tables a learner can read:
// one table per tense/mood (verbs) or declension type (adjectives), with
// person or case down the side and gender/number across the top.

import type { SpanishVariety } from "./settings";
import type { Entry, Form } from "./types";

const PERSON = ["first-person", "second-person", "third-person"];
const CASE = [
  "nominative", "accusative", "genitive", "dative", "instrumental",
  "locative", "prepositional", "ablative", "vocative", "partitive",
];
const GENDER = ["masculine", "feminine", "neuter", "common"];
const NUMBER = ["singular", "dual", "plural"];

// Tags that distinguish variants of the same cell rather than a different
// table: Spanish vos/usted forms, German article context (implied by
// strong/weak/mixed), register labels, and wiktextract bookkeeping.
const CELL_VARIANT = new Set([
  "informal", "formal", "vos-form", "with-tú", "with-vos", "second-person-semantically",
  "definite", "indefinite", "includes-article", "without-article",
  "form-of", "rare", "archaic", "dated", "obsolete", "colloquial", "dialectal",
  "uncommon", "alternative", "also", "especially", "literary", "nonstandard",
  "before-vowel", // French "bel" beside "beau"
  "irregular", // Māori "tamariki", the irregular plural of "tamaiti", is still just the plural
  "progressive", "continuative", // Greek futures; "future imperfective" already says it
]);

// Order tags appear in a table title; anything unlisted follows in source order.
const TITLE_ORDER = [
  "active", "passive",
  "comparative", "superlative",
  "strong", "weak", "mixed", "predicative", "attributive",
  "indicative", "subjunctive", "conditional", "imperative", "optative",
  "present", "imperfect", "imperfect-se", "imperfect-ra", "preterite", "historic", "past",
  "future", "perfect", "pluperfect", "anterior",
  "infinitive", "participle", "gerund", "negative",
];

const LABELS: Record<string, string> = {
  "first-person": "1st person",
  "second-person": "2nd person",
  "third-person": "3rd person",
  strong: "strong (no article)",
  weak: "weak (after a definite article)",
  mixed: "mixed (after an indefinite article)",
  historic: "simple",
  "imperfect-se": "imperfect (-se)",
  "imperfect-ra": "imperfect (-ra)",
};

const label = (tag: string) => LABELS[tag] ?? tag.replace(/-/g, " ");
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Tense + aspect pairs that have a name of their own. Only aspect languages
// (Greek) tag forms "perfective"/"imperfective", so these don't touch others.
const COMBINED_LABELS: [string[], string][] = [
  [["present", "imperfective"], "present"],
  [["imperfect", "imperfective"], "imperfect (continuous past)"],
  [["past", "perfective"], "simple past (aorist)"],
  [["future", "imperfective"], "future continuous"],
  [["future", "perfective"], "simple future"],
  [["dependent", "perfective"], "dependent (after να, θα)"],
  [["imperative", "imperfective"], "imperative, continuous"],
  [["imperative", "perfective"], "imperative, simple"],
];

function titleFor(group: string[]): string {
  // Greek tags nearly every finite form "indicative"; the tense names say enough.
  const tags = group.some((t) => t === "perfective" || t === "imperfective")
    ? group.filter((t) => t !== "indicative")
    : group;
  const used = new Set<string>();
  const parts: string[] = [];
  for (const t of tags) {
    if (used.has(t)) continue;
    const rule = COMBINED_LABELS.find(([need]) => need.includes(t) && need.every((n) => tags.includes(n)));
    if (rule) {
      rule[0].forEach((n) => used.add(n));
      parts.push(rule[1]);
    } else {
      parts.push(label(t));
    }
  }
  return capitalise(parts.join(" ") || "Forms");
}

// Subject pronouns shown before verb forms, keyed "person|number".
const PRONOUNS: Record<string, Record<string, string>> = {
  fr: { "first-person|singular": "je", "second-person|singular": "tu", "third-person|singular": "il/elle", "first-person|plural": "nous", "second-person|plural": "vous", "third-person|plural": "ils/elles" },
  es: { "first-person|singular": "yo", "second-person|singular": "tú", "third-person|singular": "él/ella/usted", "first-person|plural": "nosotros", "second-person|plural": "vosotros", "third-person|plural": "ellos/ellas/ustedes" },
  it: { "first-person|singular": "io", "second-person|singular": "tu", "third-person|singular": "lui/lei", "first-person|plural": "noi", "second-person|plural": "voi", "third-person|plural": "loro" },
  pt: { "first-person|singular": "eu", "second-person|singular": "tu", "third-person|singular": "ele/ela", "first-person|plural": "nós", "second-person|plural": "vós", "third-person|plural": "eles/elas" },
  ca: { "first-person|singular": "jo", "second-person|singular": "tu", "third-person|singular": "ell/ella", "first-person|plural": "nosaltres", "second-person|plural": "vosaltres", "third-person|plural": "ells/elles" },
  de: { "first-person|singular": "ich", "second-person|singular": "du", "third-person|singular": "er/sie/es", "first-person|plural": "wir", "second-person|plural": "ihr", "third-person|plural": "sie" },
  el: { "first-person|singular": "εγώ", "second-person|singular": "εσύ", "third-person|singular": "αυτός/αυτή/αυτό", "first-person|plural": "εμείς", "second-person|plural": "εσείς", "third-person|plural": "αυτοί/αυτές/αυτά" },
  nl: { "first-person|singular": "ik", "second-person|singular": "jij", "third-person|singular": "hij/zij", "first-person|plural": "wij", "second-person|plural": "jullie", "third-person|plural": "zij" },
};

export interface InflectionOptions {
  /** Which Spanish second-person forms to show; defaults to Spain's. */
  spanishVariety?: SpanishVariety;
}

export interface Axis {
  key: string;
  label: string;
}

export interface Cell {
  forms: string[];
  /** Subject pronoun to show before the forms, e.g. "nous", or "j’" (no space). */
  pronoun?: string;
}

export interface InflectionTable {
  /** Stable identifier: the table's grouping tags. */
  id: string;
  title: string;
  rowHeading: string;
  rows: Axis[];
  columns: Axis[];
  /** cells[rowKey][columnKey]; a missing cell has no form. */
  cells: Record<string, Record<string, Cell>>;
}

export interface OtherForm {
  label: string;
  forms: string[];
}

export interface Inflections {
  tables: InflectionTable[];
  /** Forms that don't fit a grid: infinitive, participles, comparative, diminutives, … */
  other: OtherForm[];
}

interface Classified {
  form: string;
  row: string[];
  gender: string[];
  number: string[];
  group: string[];
  /** A Spanish voseo form ("comés"), shown instead of the tú form in Rioplatense Spanish. */
  vos: boolean;
}

function classify(f: Form): Classified {
  const c: Classified = { form: f.form, row: [], gender: [], number: [], group: [], vos: f.tags.includes("vos-form") };
  for (const t of f.tags) {
    if (PERSON.includes(t) || CASE.includes(t)) c.row.push(t);
    else if (GENDER.includes(t)) c.gender.push(t);
    else if (NUMBER.includes(t)) c.number.push(t);
    else if (!CELL_VARIANT.has(t)) c.group.push(t);
  }
  // Wiktionary tags "imperfect-se" forms "imperfect" too, and French present participles "gerund".
  const redundant = new Set<string>();
  if (c.group.some((t) => t.startsWith("imperfect-"))) redundant.add("imperfect");
  if (c.group.includes("participle")) redundant.add("gerund");
  c.group = c.group.filter((t) => !redundant.has(t));
  const rank = (t: string) => {
    const i = TITLE_ORDER.indexOf(t);
    return i === -1 ? TITLE_ORDER.length : i;
  };
  c.group.sort((a, b) => rank(a) - rank(b));
  return c;
}

const orderBy = (order: string[]) => (a: string, b: string) => {
  const key = (s: string) => s.split(" ").map((t) => String(order.indexOf(t)).padStart(2, "0")).join(".");
  return key(a).localeCompare(key(b));
};

const COLUMN_ORDER = [...GENDER, ...NUMBER];

function pronounFor(lang: string, row: string, column: string, form: string, variety: SpanishVariety): string | undefined {
  const key = `${row}|${column}`;
  if (lang === "es" && variety !== "spain") {
    if (key === "second-person|singular" && variety === "rioplatense") return "vos";
    if (key === "second-person|plural") return "ustedes";
    if (key === "third-person|plural") return "ellos/ellas";
  }
  const p = PRONOUNS[lang]?.[key];
  if (p === "je" && /^[aeiouyhâàéèêëîïôûœ]/i.test(form)) return "j’";
  return p;
}

/**
 * Builds inflection tables for an entry. `lang` selects subject pronouns for
 * verb tables. The lemma itself is added to head-line-only tables (e.g.
 * Spanish adjectives list only the feminine and plural forms).
 */
export function buildInflections(entry: Entry, lang: string, options: InflectionOptions = {}): Inflections {
  const variety = options.spanishVariety ?? "spain";
  const spanish = lang === "es";
  const hasTable = entry.forms.some((f) => f.fromTable);
  const tableForms = hasTable ? entry.forms.filter((f) => f.fromTable) : entry.forms;
  const tableTags = new Map<string, Set<string>[]>();
  for (const f of tableForms) tableTags.set(f.form, [...(tableTags.get(f.form) ?? []), new Set(f.tags)]);
  // A head-line form duplicates a table cell if the same spelling has (at least) its tags there.
  // "schöner" the comparative is not the table's "schöner" (strong nominative masculine).
  const inTable = (f: Form) =>
    tableTags.get(f.form)?.some((tags) => f.tags.every((t) => CELL_VARIANT.has(t) || tags.has(t))) ?? false;

  const groups = new Map<string, Classified[]>();
  const other = new Map<string, string[]>();

  for (const f of tableForms) {
    // German "keine schönen": the negative article adds a whole duplicate table.
    if (f.tags.includes("negative") && f.tags.includes("includes-article")) continue;
    const c = classify(f);
    if (c.row.length === 0 && c.gender.length === 0 && c.number.length === 0) {
      addUnique(other, capitalise(c.group.map(label).join(" ") || "other"), f.form);
      continue;
    }
    const id = c.group.join(" ");
    groups.set(id, [...(groups.get(id) ?? []), c]);
  }

  if (!hasTable && (entry.pos === "adj" || entry.pos === "noun")) {
    addLemmaAsBaseForm(entry.word, groups);
  }

  if (hasTable) {
    // Head-line forms not already in a table: comparatives, diminutives, …
    for (const f of entry.forms) {
      if (f.fromTable || inTable(f)) continue;
      const tags = f.tags.filter((t) => !CELL_VARIANT.has(t));
      addUnique(other, capitalise(tags.map(label).join(", ") || "other"), f.form);
    }
  }

  const tables: InflectionTable[] = [];
  for (const [id, forms] of groups) {
    // "bonita" is tagged only "feminine"; if the table has a number axis, it's singular.
    const hasNumber = forms.some((c) => c.number.length > 0);
    const cells: InflectionTable["cells"] = {};
    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();
    const isVerbTable = forms.some((c) => c.row.some((r) => PERSON.includes(r)));
    const hasVos = forms.some((c) => c.vos);

    for (const c of forms) {
      const number = c.number.length === 0 && hasNumber ? ["singular"] : c.number;
      if (spanish && !keepSpanishForm(c, number, variety, hasVos)) continue;
      const row = c.row.join(" ");
      const col = [...c.gender, ...number].join(" ");
      rowKeys.add(row);
      colKeys.add(col);
      const cell = ((cells[row] ??= {})[col] ??= { forms: [] });
      if (!cell.forms.includes(c.form)) cell.forms.push(c.form);
    }

    // Outside Spain, "ustedes" replaces "vosotros" and takes the third-person plural form.
    const theyForms = cells["third-person"]?.["plural"]?.forms;
    if (spanish && variety !== "spain" && isVerbTable && theyForms) {
      (cells["second-person"] ??= {})["plural"] = { forms: [...theyForms] };
      rowKeys.add("second-person");
      colKeys.add("plural");
    }

    if (isVerbTable && !id.split(" ").includes("imperative")) {
      for (const [row, byCol] of Object.entries(cells)) {
        for (const [col, cell] of Object.entries(byCol)) {
          const pronoun = pronounFor(lang, row, col, cell.forms[0] ?? "", variety);
          if (pronoun) cell.pronoun = pronoun;
        }
      }
    }

    // Rows keep Wiktionary's order, which follows each language's convention
    // (Greek: nominative, genitive, accusative, vocative).
    const rows = [...rowKeys].map((key) => ({ key, label: capitalise(label(key)) }));
    const columns = [...colKeys].sort(orderBy(COLUMN_ORDER)).map((key) => ({
      key,
      label: capitalise(key.split(" ").map(label).join(" ")),
    }));
    tables.push({
      id,
      title: titleFor(id.split(" ").filter(Boolean)),
      rowHeading: isVerbTable ? "Person" : rows.some((r) => r.key) ? "Case" : "",
      rows,
      columns,
      cells,
    });
  }

  // Tables by person (the tenses) come before the rest (Spanish past participle
  // by gender and number), keeping Wiktionary's order within each group.
  const byPersonFirst = [...tables].sort((a, b) => Number(b.rowHeading === "Person") - Number(a.rowHeading === "Person"));
  return { tables: byPersonFirst, other: [...other].map(([l, forms]) => ({ label: l, forms })) };
}

/**
 * Spain: tú and vosotros. Latin America: tú and ustedes. Río de la Plata: vos
 * and ustedes, where vos has its own forms only in some tenses and otherwise
 * shares tú's ("vos comiste").
 */
function keepSpanishForm(c: Classified, number: string[], variety: SpanishVariety, tableHasVos: boolean): boolean {
  const second = c.row.includes("second-person");
  if (second && number.includes("plural")) return variety === "spain";
  if (c.vos) return variety === "rioplatense";
  if (second && variety === "rioplatense" && tableHasVos) return false;
  return true;
}

function addUnique(map: Map<string, string[]>, key: string, form: string) {
  const list = map.get(key) ?? [];
  if (!list.includes(form)) list.push(form);
  map.set(key, list);
}

function addLemmaAsBaseForm(lemma: string, groups: Map<string, Classified[]>) {
  const base = groups.get("");
  if (!base || base.some((c) => c.form === lemma)) return;
  const gendered = base.some((c) => c.gender.length > 0);
  base.unshift({ form: lemma, row: [], gender: gendered ? ["masculine"] : [], number: ["singular"], group: [], vos: false });
}

/** Whether a table contains `word`, so the table can be opened and the cell marked. */
export function tableContains(table: InflectionTable, word: string): boolean {
  const w = word.toLocaleLowerCase();
  return Object.values(table.cells).some((byCol) =>
    Object.values(byCol).some((cell) => cell.forms.some((f) => f.toLocaleLowerCase() === w)),
  );
}
