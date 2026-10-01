import type { ExplainResult, LanguageTranslation, LookupResult, TranslationSource } from "../shared/types";
import { PromiseCache } from "./cache";
import { explain, translate, translateLanguage, translateSource, type TranslateSteps } from "./lookup";

/** What a lookup needs to know of the user's settings. */
export interface LookupContext {
  /** The user's own language. */
  native: string;
  /** Languages being learned. */
  learning: string[];
}

/**
 * Lookups with their results cached in memory. A translation is cached in two
 * parts: the source the languages share, and each language on its own, so
 * choosing another language's tab reuses the English entry already fetched
 * and choosing it again fetches nothing.
 */
export function createLookupService(fetchFn: typeof fetch = fetch) {
  const sources = new PromiseCache<TranslationSource>(100);
  const languages = new PromiseCache<LanguageTranslation>(300);
  const explanations = new PromiseCache<ExplainResult>(300);

  const sourceKey = (text: string, from: string, targets: string[]) => `${from}|${targets.join(",")}|${text}`;
  const steps: TranslateSteps = {
    source: (text, from, targets) =>
      sources.get(sourceKey(text, from, targets), () => translateSource({ text, from, targets, fetchFn })),
    language: (source, lang) =>
      languages.get(`${sourceKey(source.query, source.lang, source.targets)}|${lang}`, () => translateLanguage(source, lang, fetchFn)),
  };

  return {
    /**
     * In the user's own language: translate into the languages being learned,
     * starting with the tab shown first. In a language being learned: explain
     * it, with its forms, in the user's language.
     */
    lookup(text: string, lang: string, { native, learning }: LookupContext, lastChosen?: string): Promise<LookupResult> {
      const query = text.trim();
      if (lang === native) return translate({ text: query, from: native, targets: learning, lastChosen }, steps);
      return explanations.get(`${lang}|${native}|${query}`, () => explain({ text: query, lang, target: native, fetchFn }));
    },

    /** One language's translation of text in the user's language, for a tab chosen after the lookup. */
    async translateLanguage(text: string, from: string, lang: string, { learning }: LookupContext): Promise<LanguageTranslation> {
      const source = await steps.source(text.trim(), from, learning);
      return steps.language(source, lang);
    },
  };
}

export type LookupService = ReturnType<typeof createLookupService>;
