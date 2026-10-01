import { createSavedLookups, type StorageArea } from "../shared/saved-lookups";
import type { ExplainResult, LanguageTranslation, LookupResult, TranslationSource } from "../shared/types";
import { PromiseCache } from "./cache";
import { explain, translate, translateLanguage, translateSource, type TranslateSteps } from "./lookup";
import { MYMEMORY_HOST, myMemoryProblem, withMyMemoryEmail } from "./translate";

/** What a lookup needs to know of the user's settings. */
export interface LookupContext {
  /** The user's own language. */
  native: string;
  /** Languages being learned. */
  learning: string[];
  /** Sent to MyMemory, and only MyMemory, to raise its daily limit. Absent or "" when not given. */
  myMemoryEmail?: string;
}

/**
 * Wraps fetch to notice any request that didn't fully succeed, including the
 * ones a lookup recovers from quietly (a lemma that couldn't be fetched, a
 * machine translation used only to break a tie, MyMemory's daily limit). A
 * result made despite such a failure is only as good as the moment allowed,
 * so it mustn't be saved for weeks.
 */
function watchRequests(fetchFn: typeof fetch) {
  const seen = { requests: 0, failures: 0 };
  const watched = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.requests++;
    let res: Response;
    try {
      res = await fetchFn(input, init);
    } catch (e) {
      seen.failures++;
      throw e;
    }
    const url = new URL(input instanceof Request ? input.url : String(input));
    const notFound = res.status === 404 && url.hostname === "kaikki.org"; // an answer: no such word
    if (!res.ok && !notFound) seen.failures++;
    else if (url.hostname === MYMEMORY_HOST && res.ok) {
      const body: unknown = await res.clone().json().catch(() => undefined);
      if (myMemoryProblem(body)) seen.failures++;
    }
    return res;
  }) as typeof fetch;
  return { fetch: watched, seen };
}

// Light checks on what comes back from storage: enough that a stale or
// hand-edited value is refetched rather than breaking the popup.
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isSource = (v: unknown): v is TranslationSource =>
  isObject(v) && typeof v.query === "string" && typeof v.lang === "string" &&
  [v.targets, v.entries, v.lemmas, v.warnings].every(Array.isArray);
const isLanguage = (v: unknown): v is LanguageTranslation =>
  isObject(v) && typeof v.lang === "string" && Array.isArray(v.senses);
const isExplanation = (v: unknown): v is ExplainResult =>
  isObject(v) && v.kind === "explain" && typeof v.query === "string" && [v.entries, v.lemmas, v.warnings].every(Array.isArray);

/**
 * Lookups with their results cached in memory and, given storage, saved there
 * too, so they survive Chrome stopping the service worker: memory first, then
 * storage, then the network. A translation is cached in two parts: the source
 * the languages share, and each language on its own, so choosing another
 * language's tab reuses the English entry already fetched and choosing it
 * again fetches nothing.
 *
 * The email address is applied per call, from the settings of that call, so a
 * changed or removed address takes effect at once. It isn't part of any cache
 * key, nor of any result: results don't depend on it.
 */
export function createLookupService(fetchFn: typeof fetch = fetch, storage?: StorageArea) {
  const sources = new PromiseCache<TranslationSource>(100);
  const languages = new PromiseCache<LanguageTranslation>(300);
  const explanations = new PromiseCache<ExplainResult>(300);
  const saved = storage && createSavedLookups(storage);

  /**
   * A saved result if there is one, else a fresh one, saved only if every
   * request behind it succeeded and the result itself is sound. A result
   * that made no request (an English phrase's source) costs nothing to remake.
   */
  async function savedOr<T>(
    key: string,
    isValid: (v: unknown) => v is T,
    isSound: (v: T) => boolean,
    fetchFn: typeof fetch,
    load: (fetchFn: typeof fetch) => Promise<T>,
  ): Promise<T> {
    const hit = await saved?.get(key, isValid);
    if (hit !== undefined) return hit;
    const { fetch, seen } = watchRequests(fetchFn);
    const result = await load(fetch);
    if (saved && seen.requests > 0 && seen.failures === 0 && isSound(result)) void saved.set(key, result);
    return result;
  }

  const sourceKey = (text: string, from: string, targets: string[]) => `${from}|${targets.join(",")}|${text}`;
  const stepsWith = (fetchFn: typeof fetch): TranslateSteps => ({
    source: (text, from, targets) => {
      const key = sourceKey(text, from, targets);
      return sources.get(key, () =>
        savedOr(`source:${key}`, isSource, (s) => s.warnings.length === 0, fetchFn,
          (fetchFn) => translateSource({ text, from, targets, fetchFn })));
    },
    language: (source, lang) => {
      const key = `${sourceKey(source.query, source.lang, source.targets)}|${lang}`;
      // A translation made from a source missing its dictionary entry fell back
      // to machine translation; it mustn't outlive the dictionary's outage.
      const sound = (t: LanguageTranslation) => t.warning === undefined && source.warnings.length === 0;
      return languages.get(key, () =>
        savedOr(`language:${key}`, isLanguage, sound, fetchFn, (fetchFn) => translateLanguage(source, lang, fetchFn)));
    },
  });
  const fetchFor = (context: LookupContext) => withMyMemoryEmail(fetchFn, context.myMemoryEmail);

  return {
    /**
     * In the user's own language: translate into the languages being learned,
     * starting with the tab shown first. In a language being learned: explain
     * it, with its forms, in the user's language.
     */
    lookup(text: string, lang: string, context: LookupContext, lastChosen?: string): Promise<LookupResult> {
      const { native, learning } = context;
      const query = text.trim();
      const fetchFn = fetchFor(context);
      if (lang === native) return translate({ text: query, from: native, targets: learning, lastChosen }, stepsWith(fetchFn));
      const key = `${lang}|${native}|${query}`;
      return explanations.get(key, () =>
        savedOr(`explain:${key}`, isExplanation, (r) => r.warnings.length === 0, fetchFn,
          (fetchFn) => explain({ text: query, lang, target: native, fetchFn })));
    },

    /** One language's translation of text in the user's language, for a tab chosen after the lookup. */
    async translateLanguage(text: string, from: string, lang: string, context: LookupContext): Promise<LanguageTranslation> {
      const steps = stepsWith(fetchFor(context));
      const source = await steps.source(text.trim(), from, context.learning);
      return steps.language(source, lang);
    },
  };
}

export type LookupService = ReturnType<typeof createLookupService>;
