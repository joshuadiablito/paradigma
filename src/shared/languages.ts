export interface Language {
  /** ISO 639-1 code, as used by MyMemory and chrome.i18n.detectLanguage. */
  code: string;
  /** English name, as used in kaikki.org URLs. */
  name: string;
  /** The language's name for itself, shown next to the English name. */
  endonym: string;
}

// Languages kaikki.org publishes English-Wiktionary data for, with enough
// inflection coverage to be useful. Add more by appending here.
export const LANGUAGES: readonly Language[] = [
  { code: "ca", name: "Catalan", endonym: "Català" },
  { code: "cs", name: "Czech", endonym: "Čeština" },
  { code: "da", name: "Danish", endonym: "Dansk" },
  { code: "de", name: "German", endonym: "Deutsch" },
  { code: "el", name: "Greek", endonym: "Ελληνικά" },
  { code: "en", name: "English", endonym: "English" },
  { code: "es", name: "Spanish", endonym: "Español" },
  { code: "fi", name: "Finnish", endonym: "Suomi" },
  { code: "fr", name: "French", endonym: "Français" },
  { code: "hu", name: "Hungarian", endonym: "Magyar" },
  { code: "it", name: "Italian", endonym: "Italiano" },
  { code: "ja", name: "Japanese", endonym: "日本語" },
  { code: "ko", name: "Korean", endonym: "한국어" },
  { code: "nb", name: "Norwegian Bokmål", endonym: "Norsk bokmål" },
  { code: "nl", name: "Dutch", endonym: "Nederlands" },
  { code: "pl", name: "Polish", endonym: "Polski" },
  { code: "pt", name: "Portuguese", endonym: "Português" },
  { code: "ro", name: "Romanian", endonym: "Română" },
  { code: "ru", name: "Russian", endonym: "Русский" },
  { code: "sv", name: "Swedish", endonym: "Svenska" },
  { code: "tr", name: "Turkish", endonym: "Türkçe" },
  { code: "uk", name: "Ukrainian", endonym: "Українська" },
  { code: "zh", name: "Chinese", endonym: "中文" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function languageByCode(code: string): Language | undefined {
  return BY_CODE.get(code);
}

/**
 * Reduces a BCP 47 tag ("fr-CA", "zh-Hant", "no") to the code used in
 * LANGUAGES, or undefined if it is empty.
 */
export function normaliseLanguageTag(tag: string | null | undefined): string | undefined {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0];
  if (!primary) return undefined;
  if (primary === "no" || primary === "nn") return "nb";
  return primary;
}
