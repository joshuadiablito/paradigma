import { buildInflections, tableContains, type InflectionOptions, type InflectionTable } from "../shared/inflections";
import { languageByCode } from "../shared/languages";
import type { Entry, ExplainResult, LanguageTranslation, LookupResult, TranslateResult } from "../shared/types";
import { isDictionaryCandidate } from "../shared/word";
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
 * its lemma ("manger") — restricted to the same part of speech, so selecting a
 * verb form doesn't also show the noun "manger". Otherwise the entries themselves.
 */
export function entriesToShow(result: ExplainResult): Entry[] {
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

/** What an entry is being shown for: the text looked up (to mark its form) and its language. */
interface EntryContext {
  query: string;
  lang: string;
  /** How many meanings to list before "more meanings"; fewer when translating, as the user knows the meaning. */
  sensesShown?: number;
}

function renderEntry(doc: Document, entry: Entry, result: EntryContext, options: InflectionOptions): HTMLElement {
  const { tables, other } = buildInflections(entry, result.lang, options);
  // Open the first tense (person tables come first), and the table the
  // selected form is in if that's another: selecting a Spanish participle
  // still shows who does what.
  const openIds = new Set([tables[0]?.id, tables.find((t) => tableContains(t, result.query))?.id]);
  const limit = result.sensesShown ?? SENSES_SHOWN;
  const shownSenses = entry.senses.slice(0, limit);
  const hiddenSenses = entry.senses.slice(limit);

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
      h(doc, "ol", { class: "lh-senses", start: limit + 1 }, hiddenSenses.map(senseItem)),
    ),
    tables.length > 0 && h(doc, "h4", {}, entry.pos === "verb" ? "Conjugation" : "Forms"),
    // A lone untitled table (most adjectives and nouns) needs no disclosure wrapper.
    tables.length === 1 && tables[0]!.title === "Forms"
      ? renderTable(doc, tables[0]!, result.query, result.lang)
      : tables.map((t) =>
          h(doc, "details", { class: "lh-table", open: openIds.has(t.id) },
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
    tables.length === 0 && INFLECTED.has(entry.pos) && h(doc, "p", { class: "lh-empty" },
      `Wiktionary has no table of forms for “${entry.word}” yet.`),
  );
}

/** Parts of speech that normally have a table of forms. */
const INFLECTED = new Set(["verb", "noun", "adj"]);

function wiktionaryLink(doc: Document, word: string, lang: string): HTMLElement {
  return h(doc, "a", { href: wiktionaryUrl(word, lang), target: "_blank", rel: "noopener noreferrer", class: "lh-wikt" },
    "Open ", h(doc, "span", { lang }, `“${word}”`), " in Wiktionary");
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
  return result.kind === "explain"
    ? renderExplain(doc, result, handlers, options)
    : renderTranslate(doc, result, handlers, options);
}

function audioButton(doc: Document, url: string, handlers: RenderHandlers): HTMLElement {
  return h(doc, "button", { type: "button", class: "lh-audio", onclick: () => handlers.onPlayAudio(url) }, "▶ Listen");
}

function renderExplain(
  doc: Document,
  result: ExplainResult,
  handlers: RenderHandlers,
  options: InflectionOptions,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  const formOf = result.entries.flatMap((e) => e.formOf.map((f) => ({ ...f, pos: e.pos })));
  const shown = entriesToShow(result);
  const audio = [...result.entries, ...shown].find((e) => e.audioUrl)?.audioUrl;
  const ipa = result.entries.find((e) => e.ipa)?.ipa;

  const header: (Node | false | undefined)[] = [
    Boolean(ipa || audio) && h(doc, "div", { class: "lh-pronunciation" },
      ipa && h(doc, "span", { class: "lh-ipa" }, ipa),
      audio && audioButton(doc, audio, handlers),
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

  // Wiktionary has no page for a phrase, so there's nothing to link to.
  const link = isDictionaryCandidate(result.query) ? wiktionaryLink(doc, shown[0]?.word ?? result.query, result.lang) : undefined;
  const credits = { wiktionary: shown.length > 0 || formOf.length > 0, machine: Boolean(result.translation) };
  const end = h(doc, "footer", {});
  fillFooter(doc, end, link, credits);
  frag.append(end);
  return frag;
}

/** Which providers' data the popup is showing, to credit only those. */
interface Credits {
  wiktionary: boolean;
  machine: boolean;
}

/** Fills the footer with a Wiktionary link and credits, hiding it when it has neither. */
function fillFooter(doc: Document, el: HTMLElement, link: HTMLElement | undefined, credits: Credits): void {
  const sources = [
    credits.wiktionary && "Wiktionary via kaikki.org (CC BY-SA)",
    credits.machine && "MyMemory",
  ].filter((s): s is string => Boolean(s));
  const data = sources.length > 0 && h(doc, "span", {}, `${link ? " · " : ""}Data: ${sources.join(", ")}`);
  el.replaceChildren(...[link, data].filter((n): n is HTMLElement => Boolean(n)));
  el.hidden = !link && !data;
}

// ── Translate view ───────────────────────────────────────────────────────────

const TAG_LABELS: Record<string, string> = { masculine: "m", feminine: "f", neuter: "n", common: "c", plural: "pl" };

function translationWord(doc: Document, w: LanguageTranslation["senses"][number]["words"][number], lang: string) {
  const grammar = w.tags.filter((t) => TAG_LABELS[t]).map((t) => TAG_LABELS[t]);
  const usage = w.tags.filter((t) => !TAG_LABELS[t]).map((t) => t.replace(/-/g, " "));
  return h(doc, "span", { class: "lh-tr-word" },
    h(doc, "strong", { lang }, w.word),
    w.roman && h(doc, "span", { class: "lh-roman" }, ` (${w.roman})`),
    grammar.length > 0 && h(doc, "abbr", { class: "lh-gender", title: w.tags.filter((t) => TAG_LABELS[t]).join(", ") }, ` ${grammar.join(" ")}`),
    usage.length > 0 && h(doc, "span", { class: "lh-tags" }, ` (${usage.join(", ")})`),
  );
}

function renderLanguagePanel(
  doc: Document,
  t: LanguageTranslation,
  query: string,
  handlers: RenderHandlers,
  options: InflectionOptions,
): Node[] {
  // A phrase's translation is a phrase too, which Wiktionary won't have a page for.
  // Without a lead word there's no single page to point to.
  const linkWord = isDictionaryCandidate(query) && t.lead !== undefined ? t.entry?.word ?? t.lead : undefined;
  const showPos = new Set(t.senses.map((s) => s.pos)).size > 1;
  const nodes: (Node | false | undefined)[] = [
    t.machine !== undefined && h(doc, "p", { class: "lh-translation" },
      h(doc, "span", { class: "lh-label" }, t.machineOf ? `Machine translation of “${t.machineOf}”: ` : "Machine translation: "),
      h(doc, "span", { lang: t.lang }, t.machine),
    ),
    t.senses.length > 0 && h(doc, "ul", { class: "lh-tr-senses" },
      t.senses.map((s) =>
        h(doc, "li", {},
          showPos && h(doc, "span", { class: "lh-pos" }, posLabel(s.pos)),
          showPos && " ",
          s.sense && h(doc, "span", { class: "lh-sense" }, `${s.sense}: `),
          s.words.flatMap((w, i) => [i > 0 ? ", " : null, translationWord(doc, w, t.lang)]),
        ),
      ),
    ),
    t.entry?.audioUrl !== undefined && h(doc, "div", { class: "lh-pronunciation" },
      t.entry.ipa && h(doc, "span", { class: "lh-ipa" }, t.entry.ipa),
      audioButton(doc, t.entry.audioUrl, handlers),
    ),
    t.entry && renderEntry(doc, t.entry, { query: t.lead ?? t.entry.word, lang: t.lang, sensesShown: 2 }, options),
    t.senses.length === 0 && t.machine === undefined && !t.warning &&
      h(doc, "p", { class: "lh-empty" }, "No translation found."),
    t.lead !== undefined && !t.entry && !t.warning &&
      h(doc, "p", { class: "lh-empty" }, "Wiktionary has no entry for ", h(doc, "span", { lang: t.lang }, `“${t.lead}”`), ", so its forms can't be shown."),
    linkWord !== undefined && h(doc, "p", { class: "lh-wikt-row" }, wiktionaryLink(doc, linkWord, t.lang)),
    t.warning !== undefined && h(doc, "ul", { class: "lh-warnings" }, h(doc, "li", {}, t.warning)),
  ];
  return nodes.filter((n): n is Node => Boolean(n));
}

/** Whether a language's panel shows anything from Wiktionary. */
const showsDictionary = (t: LanguageTranslation) => t.senses.length > 0 || t.entry !== undefined;

let tabsRendered = 0;

/**
 * One tab per language (WAI-ARIA tabs pattern): arrow keys, Home and End move
 * between tabs, and Tab moves into the panel.
 */
function renderTabs(doc: Document, panels: { label: string; content: Node[] }[]): HTMLElement {
  const prefix = `lh-tabs-${++tabsRendered}`;
  const tabs: HTMLButtonElement[] = [];
  const panelEls: HTMLElement[] = [];

  const select = (index: number, focus: boolean) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panelEls[i]!.hidden = !selected;
    });
    if (focus) tabs[index]!.focus();
  };

  panels.forEach((p, i) => {
    tabs.push(h(doc, "button", {
      type: "button",
      role: "tab",
      id: `${prefix}-tab-${i}`,
      "aria-controls": `${prefix}-panel-${i}`,
      onclick: () => select(i, false),
    }, p.label));
    panelEls.push(h(doc, "div", {
      role: "tabpanel",
      id: `${prefix}-panel-${i}`,
      "aria-labelledby": `${prefix}-tab-${i}`,
      tabindex: "0",
      class: "lh-tabpanel",
    }, p.content));
  });

  const tablist = h(doc, "div", {
    role: "tablist",
    "aria-label": "Languages",
    class: "lh-tablist",
    onkeydown: (e: Event) => {
      const key = (e as KeyboardEvent).key;
      const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
      const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 }[key];
      if (next === undefined) return;
      e.preventDefault();
      select((next + tabs.length) % tabs.length, true);
    },
  }, tabs);
  select(0, false);
  return h(doc, "div", { class: "lh-tabs" }, tablist, panelEls);
}

function renderTranslate(
  doc: Document,
  result: TranslateResult,
  handlers: RenderHandlers,
  options: InflectionOptions,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  if (result.source) {
    frag.append(h(doc, "p", { class: "lh-formof" },
      `${result.source.description} of `,
      h(doc, "strong", { lang: result.lang }, result.source.lemma),
    ));
  }

  const panels = result.languages.map((t) => ({
    label: languageByCode(t.lang)?.name ?? t.lang,
    content: renderLanguagePanel(doc, t, result.query, handlers, options),
  }));
  if (panels.length === 1) frag.append(...panels[0]!.content);
  else if (panels.length > 1) frag.append(renderTabs(doc, panels));
  else frag.append(h(doc, "p", { class: "lh-empty" }, "Choose the languages you're learning in Settings."));

  if (result.warnings.length > 0) {
    frag.append(h(doc, "ul", { class: "lh-warnings" }, result.warnings.map((w) => h(doc, "li", {}, w))));
  }
  const link = isDictionaryCandidate(result.query) ? wiktionaryLink(doc, result.source?.lemma ?? result.query, result.lang) : undefined;
  const credits = {
    wiktionary: Boolean(result.source) || result.languages.some(showsDictionary),
    machine: result.languages.some((l) => l.machine !== undefined),
  };
  const end = h(doc, "footer", {});
  fillFooter(doc, end, link, credits);
  frag.append(end);
  return frag;
}
