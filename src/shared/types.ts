export interface Form {
  form: string;
  tags: string[];
  /** Set when the form came from a conjugation/declension table rather than the headword line. */
  fromTable: boolean;
}

export interface Sense {
  gloss: string;
  tags: string[];
  example?: { text: string; translation?: string };
}

export interface FormOf {
  lemma: string;
  /** e.g. "first/third-person singular present indicative/subjunctive" */
  description: string;
  /** Wiktionary's labels for the form, e.g. "dialectal" for "book" as a past tense of "bake". */
  tags?: string[];
}

export interface Entry {
  word: string;
  /** Part of speech: "verb", "noun", "adj", … */
  pos: string;
  /** Headword line, e.g. "bonito (feminine bonita, masculine plural bonitos)". */
  head?: string;
  ipa?: string;
  audioUrl?: string;
  senses: Sense[];
  forms: Form[];
  /** Non-empty when this entry is an inflected form of another word. */
  formOf: FormOf[];
  /**
   * Wiktionary's translation table, present on English entries. Only the
   * languages asked for when parsing are kept; the full table can list hundreds.
   */
  translations: Translation[];
}

export interface Translation {
  lang: string;
  word: string;
  /** The English meaning this translates, e.g. "to ingest". */
  sense: string;
  /** Gender, register or region: "feminine", "slang", "South-America". */
  tags: string[];
  /** Romanisation for non-Latin scripts, e.g. "spíti" for σπίτι. */
  roman?: string;
}

/** A word in a language being learned, explained in the user's language. */
export interface ExplainResult {
  kind: "explain";
  query: string;
  lang: string;
  /** Dictionary entries for the looked-up word itself. */
  entries: Entry[];
  /** Entries for the lemmas that `entries` are inflections of. */
  lemmas: Entry[];
  translation?: { text: string; provider: string };
  /** Non-fatal problems, e.g. one provider being unreachable. */
  warnings: string[];
}

export interface TranslationSense {
  pos: string;
  sense: string;
  words: Omit<Translation, "lang" | "sense">[];
}

/** One language's answer when translating from the user's language. */
export interface LanguageTranslation {
  lang: string;
  /** Dictionary translations grouped by meaning; empty for phrases. */
  senses: TranslationSense[];
  /** Machine translation: for phrases, or for words the dictionary has no translation of. */
  machine?: string;
  /** What was machine-translated, when not the selection itself: its base form ("republish"). */
  machineOf?: string;
  /** The translation whose forms are shown, e.g. "comer" for "eat". */
  lead?: string;
  /** The lead's dictionary entry, for its meaning and inflection tables. */
  entry?: Entry;
  warning?: string;
}

/** A language's translation, or why it couldn't be made. */
export type LanguageOutcome = { ok: true; result: LanguageTranslation } | { ok: false; error: string };

/**
 * The part of translating a selection that every language shares: the
 * English dictionary entries (with their translation tables) and what they
 * say about the selection. Each language's translation is made from it.
 */
export interface TranslationSource {
  query: string;
  /** Language of the text: the user's own. */
  lang: string;
  /** The languages whose translations `entries` and `lemmas` keep. */
  targets: string[];
  /** Dictionary entries for the text itself, with translations into `targets`. */
  entries: Entry[];
  /** Entries for the base words of its ordinary forms ("eat" for "ate"). */
  lemmas: Entry[];
  /** When the text is mainly an inflected form: "ate" is the "simple past" of "eat". */
  formOf?: { lemma: string; description: string };
  /** The part of speech to prefer among translations: the base word's, for a form. */
  pos?: string;
  /** Non-fatal problems, e.g. the dictionary being unreachable. */
  warnings: string[];
}

/**
 * Text in the user's language, to be translated into each language being
 * learned. Only the first language shown comes with it; the others are
 * fetched when their tab is chosen, to spare the user's MyMemory allowance.
 */
export interface TranslateResult {
  kind: "translate";
  query: string;
  lang: string;
  /** When the query is an inflected form: "ate" is the "simple past" of "eat". */
  source?: { lemma: string; description: string };
  /** The languages to translate into, in tab order. */
  languages: string[];
  /** The language shown first and its translation; absent when there are no languages. */
  first?: { lang: string; outcome: LanguageOutcome };
  warnings: string[];
}

export type LookupResult = ExplainResult | TranslateResult;
