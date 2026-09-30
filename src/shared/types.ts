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
}

export interface LookupResult {
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
