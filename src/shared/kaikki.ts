// Client-side model of kaikki.org's per-word JSONL files: machine-readable
// English Wiktionary, extracted by wiktextract. One line per part of speech.
// https://kaikki.org/dictionary/rawdata.html

import type { Entry, Form, FormOf, Sense } from "./types";

export function kaikkiUrl(languageName: string, word: string): string {
  const chars = Array.from(word);
  const first = chars[0] ?? "";
  const firstTwo = chars.slice(0, 2).join("");
  const seg = encodeURIComponent;
  return `https://kaikki.org/dictionary/${seg(languageName)}/meaning/${seg(first)}/${seg(firstTwo)}/${seg(word)}.jsonl`;
}

/** Tags marking bookkeeping rows in wiktextract's `forms`, not real word forms. */
const META_FORM_TAGS = new Set([
  "table-tags",
  "inflection-template",
  "class",
  "romanization",
  "multiword-construction", // "avoir + past participle"
  "combined-form", // Spanish verb + clitic pronoun, e.g. "cómelo"
]);

// Conjugation tables sometimes carry pronunciation rows that wiktextract
// mistakes for forms (e.g. French "mɑ̃ʒ" beside "mange"). These characters
// occur in IPA but in no orthography we support. IPA also borrows θ, β and χ,
// but those are Greek letters, so they must not be listed here.
const IPA_ONLY = /[ɑɐɒɔəɘɛɜɪʊʌʒʃʁʀŋɲɥɾʎðɣʔˈˌːɨʉɯɤɵɞɶʏʝʋɫ̃]/u;

interface RawForm {
  form?: unknown;
  tags?: unknown;
  source?: unknown;
}
interface RawSense {
  glosses?: unknown;
  tags?: unknown;
  form_of?: unknown;
  examples?: unknown;
}
interface RawEntry {
  word?: unknown;
  pos?: unknown;
  senses?: unknown;
  forms?: unknown;
  sounds?: unknown;
  head_templates?: unknown;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const objects = <T>(v: unknown): T[] =>
  Array.isArray(v) ? v.filter((x): x is T => typeof x === "object" && x !== null) : [];
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

function parseForms(raw: unknown, word: string): Form[] {
  const seen = new Set<string>();
  const forms: Form[] = [];
  for (const f of objects<RawForm>(raw)) {
    const form = str(f.form)?.trim();
    const tags = strings(f.tags);
    if (!form || form === "-" || form === "—") continue;
    if (tags.some((t) => META_FORM_TAGS.has(t))) continue;
    if (IPA_ONLY.test(form) && !IPA_ONLY.test(word)) continue;
    const key = `${form}|${[...tags].sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push({ form, tags, fromTable: f.source != null });
  }
  return forms;
}

function parseSenses(raw: unknown): { senses: Sense[]; formOf: FormOf[] } {
  const senses: Sense[] = [];
  const formOf: FormOf[] = [];
  for (const s of objects<RawSense>(raw)) {
    const glosses = strings(s.glosses);
    // Nested senses list the parent gloss first; the last one is the specific meaning.
    const gloss = glosses.at(-1);
    if (!gloss) continue;
    const tags = strings(s.tags);
    const lemma = objects<{ word?: unknown }>(s.form_of).map((f) => str(f.word)).find(Boolean);
    if (lemma) {
      // "…simple past of γράφω (gráfo)": drop the lemma and any romanisation after it.
      const trailingLemma = new RegExp(`\\s+of\\s+${escapeRegExp(lemma)}(\\s*\\([^)]*\\))?$`);
      formOf.push({ lemma, description: gloss.replace(trailingLemma, "") });
      continue;
    }
    const ex = objects<{ text?: unknown; translation?: unknown; english?: unknown }>(s.examples)[0];
    const exText = str(ex?.text);
    const exTranslation = str(ex?.translation) ?? str(ex?.english);
    senses.push({
      gloss,
      tags,
      ...(exText ? { example: { text: exText, ...(exTranslation ? { translation: exTranslation } : {}) } } : {}),
    });
  }
  return { senses, formOf };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseKaikkiEntry(raw: RawEntry): Entry | undefined {
  const word = str(raw.word);
  const pos = str(raw.pos);
  if (!word || !pos) return undefined;
  const { senses, formOf } = parseSenses(raw.senses);
  if (senses.length === 0 && formOf.length === 0) return undefined;

  const sounds = objects<{ ipa?: unknown; mp3_url?: unknown; ogg_url?: unknown }>(raw.sounds);
  const ipa = sounds.map((s) => str(s.ipa)).find(Boolean);
  const audioUrl = sounds.map((s) => str(s.mp3_url) ?? str(s.ogg_url)).find(Boolean);
  const head = objects<{ expansion?: unknown }>(raw.head_templates).map((h) => str(h.expansion)).find(Boolean);

  return {
    word,
    pos,
    ...(head && head !== word ? { head } : {}),
    ...(ipa ? { ipa } : {}),
    ...(audioUrl ? { audioUrl } : {}),
    senses,
    forms: parseForms(raw.forms, word),
    formOf,
  };
}

/** Parses a kaikki.org JSONL response. Malformed lines are skipped. */
export function parseKaikki(jsonl: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = parseKaikkiEntry(JSON.parse(line) as RawEntry);
      if (entry) entries.push(entry);
    } catch {
      // A truncated or malformed line loses that part of speech, not the lookup.
    }
  }
  return entries;
}
