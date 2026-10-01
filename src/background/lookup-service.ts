import type { ExplainResult, LanguageTranslation, LookupResult, TranslationSource } from "../shared/types";
import { PromiseCache } from "./cache";
import { explain, translate, translateLanguage, translateSource, type TranslateSteps } from "./lookup";
import { withMyMemoryEmail } from "./translate";

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
 * Lookups with their results cached in memory. A translation is cached in two
 * parts: the source the languages share, and each language on its own, so
 * choosing another language's tab reuses the English entry already fetched
 * and choosing it again fetches nothing.
 *
 * The email address is applied per call, from the settings of that call, so a
 * changed or removed address takes effect at once. It isn't part of any cache
 * key: results don't depend on it.
 */
export function createLookupService(fetchFn: typeof fetch = fetch) {
  const sources = new PromiseCache<TranslationSource>(100);
  const languages = new PromiseCache<LanguageTranslation>(300);
  const explanations = new PromiseCache<ExplainResult>(300);

  const sourceKey = (text: string, from: string, targets: string[]) => `${from}|${targets.join(",")}|${text}`;
  const stepsWith = (fetchFn: typeof fetch): TranslateSteps => ({
    source: (text, from, targets) =>
      sources.get(sourceKey(text, from, targets), () => translateSource({ text, from, targets, fetchFn })),
    language: (source, lang) =>
      languages.get(`${sourceKey(source.query, source.lang, source.targets)}|${lang}`, () => translateLanguage(source, lang, fetchFn)),
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
      return explanations.get(`${lang}|${native}|${query}`, () => explain({ text: query, lang, target: native, fetchFn }));
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
