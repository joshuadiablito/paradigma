// Elided articles and pronouns: French l’, d’, qu’, j’…; Italian dell’, un’…; Catalan l’, d’.
const ELISION = /^(\p{L}{1,4})['’](\p{L}.*)$/u;

/**
 * Spellings to try, most likely first. Dictionary lookups are case- and
 * apostrophe-sensitive: "Mange" at the start of a sentence is "mange",
 * German nouns are capitalised, and Wiktionary titles use a straight apostrophe.
 */
export function lookupCandidates(text: string): string[] {
  const word = text.trim().replace(/’/g, "'").replace(/\s+/g, " ");
  if (!word) return [];
  const out: string[] = [word];
  const elided = ELISION.exec(word)?.[2];
  if (elided) out.push(elided);
  for (const w of [...out]) {
    out.push(w.toLocaleLowerCase());
    out.push(w.charAt(0).toLocaleUpperCase() + w.slice(1));
  }
  return [...new Set(out)];
}

/**
 * Whether the text is worth a dictionary lookup. Wiktionary has entries for
 * short set phrases ("pomme de terre"); longer selections are only translated.
 */
export function isDictionaryCandidate(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 60 && t.split(/\s+/).length <= 4;
}
