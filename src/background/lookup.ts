import { kaikkiUrl, parseKaikki } from "../shared/kaikki";
import { languageByCode } from "../shared/languages";
import type { Entry, LookupResult } from "../shared/types";
import { isDictionaryCandidate, lookupCandidates } from "../shared/word";
import { translateWithMyMemory } from "./translate";

const MAX_LEMMAS = 3;

export interface LookupOptions {
  text: string;
  /** Language of the text. */
  lang: string;
  /** Language to translate into. */
  target: string;
  fetchFn?: typeof fetch;
}

/** Fetches one spelling from kaikki.org. A 404 means "no such word", not an error. */
async function fetchEntries(languageName: string, word: string, fetchFn: typeof fetch): Promise<Entry[]> {
  const res = await fetchFn(kaikkiUrl(languageName, word));
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`kaikki.org responded ${res.status}`);
  return parseKaikki(await res.text());
}

async function lookUpDictionary(text: string, languageName: string, fetchFn: typeof fetch) {
  let entries: Entry[] = [];
  for (const candidate of lookupCandidates(text)) {
    entries = await fetchEntries(languageName, candidate, fetchFn);
    if (entries.length > 0) break;
  }

  // "mange" is an inflection of "manger": fetch the lemma for its meaning and tables.
  const own = new Set(entries.map((e) => e.word));
  const lemmaWords = [...new Set(entries.flatMap((e) => e.formOf.map((f) => f.lemma)))]
    .filter((w) => !own.has(w))
    .slice(0, MAX_LEMMAS);
  const settled = await Promise.allSettled(lemmaWords.map((w) => fetchEntries(languageName, w, fetchFn)));
  const lemmas = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  return { entries, lemmas };
}

/**
 * Looks text up in Wiktionary (via kaikki.org) and translates it with
 * MyMemory, in parallel. Either provider failing leaves a warning; the
 * lookup only fails if both do.
 */
export async function lookUp({ text, lang, target, fetchFn = fetch }: LookupOptions): Promise<LookupResult> {
  const language = languageByCode(lang);
  if (!language) throw new Error(`Unsupported language: ${lang}`);
  const query = text.trim();

  const [dictionary, translation] = await Promise.allSettled([
    isDictionaryCandidate(query)
      ? lookUpDictionary(query, language.name, fetchFn)
      : Promise.resolve({ entries: [], lemmas: [] }),
    lang === target ? Promise.resolve(undefined) : translateWithMyMemory(query, lang, target, fetchFn),
  ]);

  const warnings: string[] = [];
  if (dictionary.status === "rejected") warnings.push(`Dictionary unavailable: ${message(dictionary.reason)}`);
  if (translation.status === "rejected") warnings.push(`Translation unavailable: ${message(translation.reason)}`);
  if (dictionary.status === "rejected" && translation.status === "rejected") {
    throw new Error(warnings.join(". "));
  }

  return {
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

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
