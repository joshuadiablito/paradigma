import { normaliseLanguageTag } from "../shared/languages";
import type { ActivationReason } from "../shared/messages";
import type { Settings } from "../shared/settings";

export interface PageLanguage {
  lang: string | null;
  reason: ActivationReason;
}

/**
 * Decides whether a page is in a language being learned. A per-site rule
 * wins; then the page's declared `lang`; then Chrome's detection of the text
 * (many sites declare the wrong language, or none).
 */
export function resolvePageLanguage(input: {
  host: string;
  htmlLang: string | null | undefined;
  detected: string | null | undefined;
  settings: Settings;
}): PageLanguage {
  const { host, htmlLang, detected, settings } = input;
  const rule = settings.sites[host];
  if (rule?.mode === "off") return { lang: null, reason: "site-off" };
  if (rule?.mode === "on") return { lang: rule.lang, reason: "site-on" };
  if (settings.learning.length === 0) return { lang: null, reason: "no-languages" };

  const declared = normaliseLanguageTag(htmlLang);
  if (declared && settings.learning.includes(declared)) return { lang: declared, reason: "page-lang" };
  const guessed = normaliseLanguageTag(detected);
  if (guessed && settings.learning.includes(guessed)) return { lang: guessed, reason: "detected" };
  return { lang: null, reason: "not-learning" };
}

/**
 * The language of one piece of text. An element-level `lang` (a French quote
 * in an English article) overrides the page, unless it merely repeats the
 * page's declared language on a wrapper element.
 */
export function resolveTextLanguage(input: {
  page: PageLanguage;
  /** `lang` of the nearest ancestor with one, below <html>; null if none. */
  elementLang: string | null;
  htmlLang: string | null | undefined;
  settings: Settings;
}): string | null {
  const { page, elementLang, htmlLang, settings } = input;
  if (page.reason === "site-off") return null;
  if (page.reason === "site-on") return page.lang;

  const marked = normaliseLanguageTag(elementLang);
  if (!marked || marked === normaliseLanguageTag(htmlLang)) return page.lang;
  return settings.learning.includes(marked) ? marked : null;
}
