import { kaikkiUrl, parseKaikki, type ParseOptions } from "../shared/kaikki";
import { languageByCode } from "../shared/languages";
import type {
  Entry,
  ExplainResult,
  LanguageOutcome,
  LanguageTranslation,
  TranslateResult,
  TranslationSense,
  TranslationSource,
} from "../shared/types";
import { isDictionaryCandidate, lookupCandidates } from "../shared/word";
import { machineTranslate, translateWithMyMemory, type MachineTranslation } from "./translate";

const MAX_LEMMAS = 3;
const MAX_SENSES = 4;
const MAX_WORDS_PER_SENSE = 4;
/** Translations Wiktionary labels like this aren't worth teaching. */
const UNHELPFUL = new Set(["obsolete", "archaic", "dated", "rare", "historical"]);
/** Labels that describe a word's grammar rather than restrict its use. */
const GRAMMATICAL = new Set(["masculine", "feminine", "neuter", "common", "plural", "singular", "perfective", "imperfective"]);

type Fetch = typeof fetch;

/** Fetches one spelling from kaikki.org. A 404 means "no such word", not an error. */
async function fetchEntries(languageName: string, word: string, fetchFn: Fetch, options: ParseOptions = {}) {
  const res = await fetchFn(kaikkiUrl(languageName, word));
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`kaikki.org responded ${res.status}`);
  return parseKaikki(await res.text(), options);
}

/**
 * Looks a word up under each plausible spelling until one is found, then
 * fetches the lemmas it is a form of ("mange" → "manger", "ate" → "eat").
 */
async function lookUpWord(text: string, languageName: string, fetchFn: Fetch, options: ParseOptions = {}) {
  let entries: Entry[] = [];
  for (const candidate of lookupCandidates(text)) {
    entries = await fetchEntries(languageName, candidate, fetchFn, options);
    if (entries.length > 0) break;
  }
  const own = new Set(entries.map((e) => e.word));
  const lemmaWords = [...new Set(entries.flatMap((e) => e.formOf.map((f) => f.lemma)))]
    .filter((w) => !own.has(w))
    .slice(0, MAX_LEMMAS);
  const settled = await Promise.allSettled(lemmaWords.map((w) => fetchEntries(languageName, w, fetchFn, options)));
  const lemmas = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  return { entries, lemmas };
}

function languageName(code: string): string {
  const language = languageByCode(code);
  if (!language) throw new Error(`Unsupported language: ${code}`);
  return language.name;
}

const settle = async <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  (await Promise.allSettled([promise]))[0]!;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── Explain: a word in a language being learned ─────────────────────────────

export interface ExplainOptions {
  text: string;
  /** Language of the text: one being learned. */
  lang: string;
  /** The user's language, to translate into. */
  target: string;
  fetchFn?: Fetch;
}

/** Whether the dictionary found what a word means, itself or through its lemma. */
const hasMeanings = ({ entries, lemmas }: { entries: Entry[]; lemmas: Entry[] }) =>
  [...entries, ...lemmas].some((e) => e.senses.length > 0);

/**
 * Looks a word up in Wiktionary (via kaikki.org) and, only if that doesn't say
 * what it means, translates it with MyMemory. Word-level machine translation
 * is unreliable ("tamariki" → "there is one dog", "mange" → "eaten") and
 * spends the user's daily allowance, so it is kept for phrases, words the
 * dictionary lacks, and the dictionary being unreachable. Either provider
 * failing leaves a warning; the lookup only fails if both do.
 */
export async function explain({ text, lang, target, fetchFn = fetch }: ExplainOptions): Promise<ExplainResult> {
  const name = languageName(lang);
  const query = text.trim();

  const dictionary = await settle(
    isDictionaryCandidate(query) ? lookUpWord(query, name, fetchFn) : Promise.resolve({ entries: [], lemmas: [] }),
  );
  const found = dictionary.status === "fulfilled" && hasMeanings(dictionary.value);
  const translation = await settle(
    lang === target || found ? Promise.resolve(undefined) : translateWithMyMemory(query, lang, target, fetchFn),
  );

  const warnings: string[] = [];
  if (dictionary.status === "rejected") warnings.push(`Dictionary unavailable: ${message(dictionary.reason)}`);
  if (translation.status === "rejected") warnings.push(`Translation unavailable: ${message(translation.reason)}`);
  if (dictionary.status === "rejected" && translation.status === "rejected") {
    throw new Error(warnings.join(". "));
  }

  return {
    kind: "explain",
    query,
    lang,
    entries: dictionary.status === "fulfilled" ? dictionary.value.entries : [],
    lemmas: dictionary.status === "fulfilled" ? dictionary.value.lemmas : [],
    ...(translation.status === "fulfilled" && translation.value
      ? { translation: { text: translation.value, provider: "MyMemory" } }
      : {}),
    warnings,
  };
}

// ── Translate: a word or phrase in the user's language ──────────────────────

/**
 * Groups one language's translations by meaning, dropping obsolete and rare
 * words. Keeps them all; `limitSenses` trims for display once the common
 * word has been chosen, since it may be far down Wiktionary's list.
 */
export function sensesFor(entries: Entry[], lang: string): TranslationSense[] {
  const senses: TranslationSense[] = [];
  for (const entry of entries) {
    for (const t of entry.translations) {
      if (t.lang !== lang || t.tags.some((tag) => UNHELPFUL.has(tag))) continue;
      let sense = senses.find((s) => s.pos === entry.pos && s.sense === t.sense);
      if (!sense) {
        sense = { pos: entry.pos, sense: t.sense, words: [] };
        senses.push(sense);
      }
      if (!sense.words.some((w) => w.word === t.word)) {
        sense.words.push({ word: t.word, tags: t.tags, ...(t.roman ? { roman: t.roman } : {}) });
      }
    }
  }
  return senses;
}

export function limitSenses(senses: TranslationSense[]): TranslationSense[] {
  return senses.slice(0, MAX_SENSES).map((s) => ({ ...s, words: s.words.slice(0, MAX_WORDS_PER_SENSE) }));
}

/** Labels marking a form too rare to translate through: "book" as a dialect past tense of "bake". */
const MARGINAL_FORM = new Set(["dialectal", "rare", "obsolete", "archaic", "nonstandard", "dated", "nonce-word"]);

/**
 * The translation to show forms for: the first word of the most common
 * meaning, preferring one with no register or regional label (so "comer",
 * not South American "jamear").
 */
export function leadTranslation(senses: TranslationSense[]): { word: string; pos: string } | undefined {
  const first = senses[0];
  if (!first) return undefined;
  const plain = first.words.find((w) => w.tags.every((t) => GRAMMATICAL.has(t))) ?? first.words[0];
  return plain && { word: plain.word, pos: first.pos };
}

/** The dictionary entry for a translation, following an inflected form to its lemma ("belle" → "beau"). */
async function targetEntry(word: string, lang: string, pos: string | undefined, fetchFn: Fetch) {
  const { entries, lemmas } = await lookUpWord(word, languageName(lang), fetchFn);
  const all = [...entries.filter((e) => e.senses.length > 0), ...lemmas];
  return all.find((e) => e.pos === pos) ?? all[0];
}

const MAX_MACHINE_CANDIDATES = 5;

/** Whether an entry's definitions use the English word: "profesor" is glossed "teacher, professor". */
export function glossesMention(entry: Entry, english: string): boolean {
  const word = new RegExp(`(^|[^\\p{L}])${escapeRegExp(english.toLocaleLowerCase())}($|[^\\p{L}])`, "u");
  return entry.senses.some((s) => word.test(s.gloss.toLocaleLowerCase()));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Words worth looking up from a machine translation: the translation itself,
 * then MyMemory's alternatives, then the words of short multi-word ones
 * ("για αναδημοσίευση" → "αναδημοσίευση"). Long sentences are skipped.
 */
export function machineCandidates(mt: MachineTranslation): string[] {
  const whole = [mt.text, ...mt.alternatives]
    .map(withoutPunctuation)
    .filter((t) => t && t.split(/\s+/).length <= 3);
  const parts = whole.flatMap((t) => t.split(/\s+/)).filter((w) => [...w].length >= 4);
  return [...new Set([...whole.filter((t) => !/\s/.test(t)), ...parts, ...whole])].slice(0, MAX_MACHINE_CANDIDATES);
}

const withoutPunctuation = (t: string) => t.replace(/[.,;:!?¿¡"«»“”()]/g, "").trim();

/** Whether a candidate is MyMemory's main translation or one of its words, rather than an alternative. */
export function isFromMachineText(candidate: string, mt: MachineTranslation): boolean {
  const main = withoutPunctuation(mt.text).toLocaleLowerCase();
  const word = candidate.toLocaleLowerCase();
  return word === main || main.split(/\s+/).includes(word);
}

/**
 * The most useful dictionary entry among candidate translations: one with the
 * same part of speech as the English word and a table of forms, if any has both.
 * Also says which candidate it was found under.
 */
async function bestEntry(candidates: string[], lang: string, pos: string | undefined, fetchFn: Fetch) {
  let best: { entry: Entry; candidate: string; score: number } | undefined;
  for (const candidate of candidates) {
    const entry = await targetEntry(candidate, lang, pos, fetchFn).catch(() => undefined);
    if (!entry) continue;
    const score = (entry.pos === pos ? 2 : 0) + (entry.forms.length >= 4 ? 1 : 0);
    if (!best || score > best.score) best = { entry, candidate, score };
    if (score === 3) break;
  }
  return best;
}

/** A sense presenting a word whose own entry confirms it as the translation. */
const usualTranslation = (entry: Entry): TranslationSense =>
  ({ pos: entry.pos, sense: "usual translation", words: [{ word: entry.word, tags: [] }] });

/**
 * Picks the common word among dictionary translations. Wiktionary doesn't
 * order translations by frequency ("enseñador" before "profesor"), nor
 * meanings ("to leave behind" before "to lose remembrance of"), so a machine
 * translation breaks the tie: if it names one of the dictionary's words, that
 * word leads and its meaning moves to the top. The dictionary still decides
 * what's valid.
 */
export function preferMachineChoice(
  senses: TranslationSense[],
  mt: MachineTranslation | undefined,
): { senses: TranslationSense[]; lead?: { word: string; pos: string } } {
  if (!mt) return { senses };
  const said = new Set([mt.text, ...mt.alternatives].map((t) => t.toLocaleLowerCase()));
  const index = senses.findIndex((s) => s.words.some((w) => said.has(w.word.toLocaleLowerCase())));
  if (index === -1) return { senses };
  const sense = senses[index]!;
  const word = sense.words.find((w) => said.has(w.word.toLocaleLowerCase()))!;
  const reordered = { ...sense, words: [word, ...sense.words.filter((w) => w !== word)] };
  return { senses: [reordered, ...senses.filter((_, i) => i !== index)], lead: { word: word.word, pos: sense.pos } };
}

async function translateInto(source: TranslationSource, lang: string, fetchFn: Fetch): Promise<LanguageTranslation> {
  const { query, lang: from } = source;
  // The English lemma, when the selection is an inflected form ("republish"
  // for "republished"), and its part of speech, to prefer translations of the same kind.
  const hint = { lemma: source.formOf?.lemma, pos: source.pos };
  // A word's own translations and its base word's: "running" is an adjective
  // ("three days running") but mostly a form of "run". The base word's come
  // first when the word is mainly a form of it.
  const own = sensesFor(source.entries, lang);
  const base = sensesFor(source.lemmas, lang);
  // The meanings the selection most likely has: for a form, the base word's
  // of the same part of speech ("running" → the verb "run", not the noun).
  const formMeanings = hint.lemma ? base.filter((m) => m.pos === hint.pos) : [];
  const primary = formMeanings.length > 0 ? formMeanings : [...own, ...base];
  const secondary = formMeanings.length > 0 ? [...base.filter((m) => m.pos !== hint.pos), ...own] : [];
  const result: LanguageTranslation = { lang, senses: limitSenses([...primary, ...secondary]) };
  const single = isDictionaryCandidate(query);

  if (result.senses.length > 0) {
    const english = hint.lemma ?? query;
    const mt = await machineTranslate(english, from, lang, fetchFn).catch(() => undefined);
    const preferred = preferMachineChoice(primary, mt);
    let senses = [...preferred.senses, ...secondary];
    let lead = preferred.lead;
    // The dictionary may simply lack the usual word ("teacher": enseñador but
    // not profesor). Accept the machine's word if its own entry says it means
    // the English word.
    if (!lead && mt && isDictionaryCandidate(mt.text)) {
      const entry = await targetEntry(mt.text, lang, hint.pos, fetchFn).catch(() => undefined);
      if (entry && entry.pos === hint.pos && glossesMention(entry, english)) {
        lead = { word: entry.word, pos: entry.pos };
        senses = [usualTranslation(entry), ...senses];
      }
    }
    result.senses = limitSenses(senses);
    lead ??= leadTranslation(result.senses)!;
    result.lead = lead.word;
    try {
      const entry = await targetEntry(lead.word, lang, lead.pos, fetchFn);
      if (entry) result.entry = entry;
    } catch (e) {
      result.warning = `Dictionary unavailable: ${message(e)}`;
    }
    return result;
  }

  // No dictionary translation: a phrase, or a word Wiktionary doesn't translate
  // into this language. Machine-translate the base form of a word, as an
  // inflected one ("republished") tends to come back as a form, or a noun, that
  // has no dictionary entry.
  const machineOf = single && hint.lemma ? hint.lemma : query;
  let mt: MachineTranslation;
  try {
    mt = await machineTranslate(machineOf, from, lang, fetchFn);
  } catch (e) {
    result.warning = `Translation unavailable: ${message(e)}`;
    return result;
  }
  result.machine = mt.text;
  if (machineOf !== query) result.machineOf = machineOf;
  if (!single) return result;

  const candidates = machineCandidates(mt);
  const best = await bestEntry(candidates, lang, hint.pos, fetchFn);
  if (best) {
    result.lead = best.entry.word;
    result.entry = best.entry;
    // MyMemory's main answer can be junk while an alternative is right: "speak"
    // into Māori gives "kia tu, kia oho, kia mataara", with "kōrero" among the
    // alternatives. When the word found came from an alternative and its own
    // entry says it means the English word, present it as the translation and
    // drop the unrelated machine text.
    if (!isFromMachineText(best.candidate, mt) && glossesMention(best.entry, machineOf)) {
      result.senses = [usualTranslation(best.entry)];
      delete result.machine;
      delete result.machineOf;
    }
  } else if (candidates[0]) {
    result.lead = candidates[0];
  }
  return result;
}

export interface SourceOptions {
  text: string;
  /** Language of the text: the user's own. */
  from: string;
  /** Languages being learned, whose translations to keep from the dictionary. */
  targets: string[];
  fetchFn?: Fetch;
}

/**
 * The part of translating text that every language shares: for an English
 * word, its Wiktionary entry with translations into each target (only English
 * Wiktionary has translation tables), and the base word it's a form of.
 * Phrases and other source languages need no request here.
 */
export async function translateSource({ text, from, targets, fetchFn = fetch }: SourceOptions): Promise<TranslationSource> {
  const query = text.trim();
  const warnings: string[] = [];
  let entries: Entry[] = [];
  let lemmas: Entry[] = [];

  if (from === "en" && isDictionaryCandidate(query)) {
    try {
      ({ entries, lemmas } = await lookUpWord(query, languageName(from), fetchFn, { translationsInto: targets }));
    } catch (e) {
      warnings.push(`Dictionary unavailable: ${message(e)}`);
    }
  }
  // Only when the word is mainly a form of another ("ate" → "eat") is it
  // described as one; "book" being a dialect past tense of "bake" is not.
  const main = entries[0];
  const formOf = main && main.senses.length === 0
    ? main.formOf.find((f) => lemmas.some((l) => l.word === f.lemma))
    : undefined;
  const pos = (formOf ? lemmas.find((l) => l.word === formOf.lemma) : main)?.pos;
  // Translate through the base words of ordinary forms only.
  const usable = new Set(entries.flatMap((e) => e.formOf)
    .filter((f) => !(f.tags ?? []).some((t) => MARGINAL_FORM.has(t)))
    .map((f) => f.lemma));

  return {
    query,
    lang: from,
    targets,
    entries,
    lemmas: lemmas.filter((l) => usable.has(l.word)),
    ...(formOf ? { formOf: { lemma: formOf.lemma, description: formOf.description } } : {}),
    ...(pos ? { pos } : {}),
    warnings,
  };
}

/**
 * Translates text into one language being learned, from its shared source: a
 * word gets the dictionary's translations by meaning and the forms of the
 * main one; a phrase gets a machine translation. Rejects only when nothing at
 * all was found, so that a failure is never kept as if it were an answer.
 */
export async function translateLanguage(source: TranslationSource, lang: string, fetchFn: Fetch = fetch): Promise<LanguageTranslation> {
  languageName(lang); // rejects an unsupported language before any request
  const result = await translateInto(source, lang, fetchFn);
  if (result.warning !== undefined && result.senses.length === 0 && result.machine === undefined) {
    throw new Error(result.warning);
  }
  return result;
}

/**
 * The language whose tab is shown first: the one the user last chose, if
 * they're still learning it, else the first.
 */
export function firstLanguage(languages: string[], lastChosen: string | undefined): string | undefined {
  return lastChosen !== undefined && languages.includes(lastChosen) ? lastChosen : languages[0];
}

/** The two steps of a translation, separate so that each can be cached. */
export interface TranslateSteps {
  source(text: string, from: string, targets: string[]): Promise<TranslationSource>;
  language(source: TranslationSource, lang: string): Promise<LanguageTranslation>;
}

export const uncachedSteps = (fetchFn: Fetch = fetch): TranslateSteps => ({
  source: (text, from, targets) => translateSource({ text, from, targets, fetchFn }),
  language: (source, lang) => translateLanguage(source, lang, fetchFn),
});

export interface TranslateOptions {
  text: string;
  /** Language of the text: the user's own. */
  from: string;
  /** Languages being learned. */
  targets: string[];
  /** The language the user last chose a tab for, if any. */
  lastChosen?: string | undefined;
}

/**
 * Starts translating text from the user's language into the languages being
 * learned: the shared source, and only the language shown first. The others
 * are translated when their tab is chosen (`translateLanguage` with the same
 * source), so a lookup costs one language's requests, not every language's.
 */
export async function translate(
  { text, from, targets, lastChosen }: TranslateOptions,
  steps: TranslateSteps = uncachedSteps(),
): Promise<TranslateResult> {
  const languages = targets.filter((t) => t !== from);
  const source = await steps.source(text, from, targets);
  const lang = firstLanguage(languages, lastChosen);
  let first: TranslateResult["first"];
  if (lang !== undefined) {
    const outcome = await steps.language(source, lang).then(
      (result): LanguageOutcome => ({ ok: true, result }),
      (e: unknown): LanguageOutcome => ({ ok: false, error: message(e) }),
    );
    // With other languages to try, the failure belongs in this one's tab.
    if (!outcome.ok && languages.length === 1) throw new Error(outcome.error);
    first = { lang, outcome };
  }

  return {
    kind: "translate",
    query: source.query,
    lang: from,
    ...(source.formOf ? { source: source.formOf } : {}),
    languages,
    ...(first ? { first } : {}),
    warnings: source.warnings,
  };
}

