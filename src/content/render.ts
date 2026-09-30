import { buildInflections, tableContains, type InflectionOptions, type InflectionTable } from "../shared/inflections";
import { languageByCode } from "../shared/languages";
import type { Entry, LookupResult } from "../shared/types";
import { h } from "./dom";

const SENSES_SHOWN = 4;

const POS_LABELS: Record<string, string> = {
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  conj: "conjunction",
  det: "determiner",
  pron: "pronoun",
  intj: "interjection",
  num: "numeral",
  art: "article",
};
const posLabel = (pos: string) => POS_LABELS[pos] ?? pos;

function wiktionaryUrl(word: string, lang: string): string {
  const anchor = languageByCode(lang)?.name.replace(/ /g, "_") ?? "";
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word.replace(/ /g, "_"))}#${encodeURIComponent(anchor)}`;
}

/**
 * Which entries to explain in full. For an inflected form ("mange") that's
 * its lemma ("manger") — restricted to the same part of speech, so hovering a
 * verb form doesn't also show the noun "manger". Otherwise the entries themselves.
 */
export function entriesToShow(result: LookupResult): Entry[] {
  const own = result.entries.filter((e) => e.senses.length > 0);
  const formPos = new Set(result.entries.filter((e) => e.formOf.length > 0).map((e) => e.pos));
  const matching = result.lemmas.filter((l) => formPos.has(l.pos));
  return [...own, ...(matching.length > 0 ? matching : result.lemmas)];
}

function renderTable(doc: Document, table: InflectionTable, query: string, lang: string): HTMLElement {
  const q = query.toLocaleLowerCase();
  const hasRowHeader = table.rows.some((r) => r.key);
  return h(doc, "table", {},
    h(doc, "caption", { class: "lh-sr-only" }, table.title),
    h(doc, "thead", {},
      h(doc, "tr", {},
        hasRowHeader && h(doc, "th", { scope: "col" }, table.rowHeading),
        table.columns.map((c) => h(doc, "th", { scope: "col" }, c.label)),
      ),
    ),
    h(doc, "tbody", {},
      table.rows.map((row) =>
        h(doc, "tr", {},
          hasRowHeader && h(doc, "th", { scope: "row" }, row.label),
          table.columns.map((col) => {
            const cell = table.cells[row.key]?.[col.key];
            if (!cell) return h(doc, "td", {}, h(doc, "span", { "aria-label": "none" }, "—"));
            return h(doc, "td", { lang },
              cell.pronoun && h(doc, "span", { class: "lh-pronoun" }, cell.pronoun.endsWith("’") ? cell.pronoun : `${cell.pronoun} `),
              cell.forms.flatMap((f, i) => [
                i > 0 ? " / " : null,
                f.toLocaleLowerCase() === q ? h(doc, "mark", {}, f) : f,
              ]),
            );
          }),
        ),
      ),
    ),
  );
}

function renderEntry(doc: Document, entry: Entry, result: LookupResult, options: InflectionOptions): HTMLElement {
  const { tables, other } = buildInflections(entry, result.lang, options);
  // Open the table the hovered form is in; otherwise the first.
  const openId = (tables.find((t) => tableContains(t, result.query)) ?? tables[0])?.id;
  const shownSenses = entry.senses.slice(0, SENSES_SHOWN);
  const hiddenSenses = entry.senses.slice(SENSES_SHOWN);

  const senseItem = (s: Entry["senses"][number]) =>
    h(doc, "li", {},
      s.tags.length > 0 && h(doc, "span", { class: "lh-tags" }, `(${s.tags.join(", ")}) `),
      s.gloss,
      s.example && h(doc, "span", { class: "lh-example" },
        h(doc, "span", { lang: result.lang }, s.example.text),
        s.example.translation && ` — ${s.example.translation}`,
      ),
    );

  return h(doc, "section", { class: "lh-entry" },
    h(doc, "h3", {},
      h(doc, "span", { lang: result.lang }, entry.word),
      " ",
      h(doc, "span", { class: "lh-pos" }, posLabel(entry.pos)),
    ),
    entry.head && h(doc, "p", { class: "lh-head", lang: result.lang }, entry.head),
    entry.ipa && entry.word !== result.query && h(doc, "p", { class: "lh-ipa" }, entry.ipa),
    shownSenses.length > 0 && h(doc, "ol", { class: "lh-senses" }, shownSenses.map(senseItem)),
    hiddenSenses.length > 0 && h(doc, "details", { class: "lh-more" },
      h(doc, "summary", {}, `${hiddenSenses.length} more meaning${hiddenSenses.length === 1 ? "" : "s"}`),
      h(doc, "ol", { class: "lh-senses", start: SENSES_SHOWN + 1 }, hiddenSenses.map(senseItem)),
    ),
    tables.length > 0 && h(doc, "h4", {}, entry.pos === "verb" ? "Conjugation" : "Forms"),
    // A lone untitled table (most adjectives and nouns) needs no disclosure wrapper.
    tables.length === 1 && tables[0]!.title === "Forms"
      ? renderTable(doc, tables[0]!, result.query, result.lang)
      : tables.map((t) =>
          h(doc, "details", { class: "lh-table", open: t.id === openId },
            h(doc, "summary", {}, t.title),
            renderTable(doc, t, result.query, result.lang),
          ),
        ),
    other.length > 0 && h(doc, "dl", { class: "lh-other" },
      other.flatMap((o) => [
        h(doc, "dt", {}, o.label),
        h(doc, "dd", { lang: result.lang }, o.forms.join(", ")),
      ]),
    ),
  );
}

export interface RenderHandlers {
  onPlayAudio: (url: string) => void;
}

export function renderResult(
  doc: Document,
  result: LookupResult,
  handlers: RenderHandlers,
  options: InflectionOptions = {},
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  const formOf = result.entries.flatMap((e) => e.formOf.map((f) => ({ ...f, pos: e.pos })));
  const shown = entriesToShow(result);
  const audio = [...result.entries, ...shown].find((e) => e.audioUrl)?.audioUrl;
  const ipa = result.entries.find((e) => e.ipa)?.ipa;

  const header: (Node | false | undefined)[] = [
    Boolean(ipa || audio) && h(doc, "div", { class: "lh-pronunciation" },
      ipa && h(doc, "span", { class: "lh-ipa" }, ipa),
      audio && h(doc, "button", {
        type: "button",
        class: "lh-audio",
        onclick: () => handlers.onPlayAudio(audio),
      }, "▶ Listen"),
    ),
    formOf.length > 0 && h(doc, "ul", { class: "lh-formof" },
      formOf.map((f) =>
        h(doc, "li", {},
          h(doc, "span", { class: "lh-pos" }, posLabel(f.pos)),
          " ",
          `${f.description} of `,
          h(doc, "strong", { lang: result.lang }, f.lemma),
        ),
      ),
    ),
    // Word-level machine translation is often wrong ("mange" → "eaten"), so it
    // follows the dictionary's analysis and is labelled as what it is.
    result.translation && h(doc, "p", { class: "lh-translation" },
      h(doc, "span", { class: "lh-label" }, "Machine translation: "),
      h(doc, "span", {}, result.translation.text),
    ),
  ];
  frag.append(...header.filter((n): n is Node => Boolean(n)));

  for (const entry of shown) frag.append(renderEntry(doc, entry, result, options));

  if (shown.length === 0 && formOf.length === 0 && !result.translation) {
    frag.append(h(doc, "p", { class: "lh-empty" }, "No dictionary entry found."));
  }
  if (result.warnings.length > 0) {
    frag.append(h(doc, "ul", { class: "lh-warnings" }, result.warnings.map((w) => h(doc, "li", {}, w))));
  }

  const linkWord = shown[0]?.word ?? result.query;
  frag.append(
    h(doc, "footer", {},
      h(doc, "a", { href: wiktionaryUrl(linkWord, result.lang), target: "_blank", rel: "noopener noreferrer" },
        "Open in Wiktionary"),
      h(doc, "span", {}, " · Data: Wiktionary via kaikki.org (CC BY-SA)"),
      result.translation && h(doc, "span", {}, `, ${result.translation.provider}`),
    ),
  );
  return frag;
}
