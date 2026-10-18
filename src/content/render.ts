import { buildInflections, tableContains, type InflectionOptions, type InflectionTable } from "../shared/inflections";
import { languageByCode } from "../shared/languages";
import type { Entry, ExplainResult, LanguageOutcome, LanguageTranslation, LookupResult, TranslateResult } from "../shared/types";
import { isDictionaryCandidate } from "../shared/word";
import type { Speech, Spoken } from "../shared/speech";
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

/**
 * Makes a word or form something to listen to: a button showing `content`
 * that says `text`, or `content` as it is when it can't be said.
 */
type Say = (text: string, content: Node | string) => Node | string;

const noSay: Say = (_text, content) => content;

/** What a table cell says: the form with its subject pronoun, "nous mangeons", "j’aime", "il mange". */
export function cellSpeech(pronoun: string | undefined, form: string): string {
  if (!pronoun) return form;
  const first = pronoun.split("/")[0]!;
  return first.endsWith("’") ? `${first}${form}` : `${first} ${form}`;
}

function renderTable(doc: Document, table: InflectionTable, query: string, lang: string, say: Say): HTMLElement {
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
                say(cellSpeech(cell.pronoun, f), f.toLocaleLowerCase() === q ? h(doc, "mark", {}, f) : f),
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

function renderEntry(
  doc: Document,
  entry: Entry,
  result: EntryContext,
  options: RenderOptions,
  handlers?: RenderHandlers,
): HTMLElement {
  const { tables, other } = buildInflections(entry, result.lang, options);
  // Every form can be listened to. Wiktionary's recording is of the entry's
  // own word; its other forms are read by the computer's voice.
  const status = h(doc, "p", { class: "lh-listen-status", role: "status" });
  const recordings = entry.audioUrl ? { [entry.word]: entry.audioUrl } : {};
  const say = handlers ? sayer(doc, result.lang, recordings, handlers, options, status) : noSay;
  // Forms other than the entry's own word need a voice.
  const sayable = handlers !== undefined && (options.speechLanguages?.has(result.lang) ?? false);
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
      h(doc, "span", { lang: result.lang }, say(entry.word, entry.word)),
      " ",
      h(doc, "span", { class: "lh-pos" }, posLabel(entry.pos)),
    ),
    status,
    entry.head && h(doc, "p", { class: "lh-head", lang: result.lang }, entry.head),
    entry.ipa && entry.word !== result.query && h(doc, "p", { class: "lh-ipa" }, entry.ipa),
    shownSenses.length > 0 && h(doc, "ol", { class: "lh-senses" }, shownSenses.map(senseItem)),
    hiddenSenses.length > 0 && h(doc, "details", { class: "lh-more" },
      h(doc, "summary", {}, `${hiddenSenses.length} more meaning${hiddenSenses.length === 1 ? "" : "s"}`),
      h(doc, "ol", { class: "lh-senses", start: limit + 1 }, hiddenSenses.map(senseItem)),
    ),
    tables.length > 0 && h(doc, "h4", {},
      entry.pos === "verb" ? "Conjugation" : "Forms",
      sayable && h(doc, "span", { class: "lh-hint" }, " · select a form to hear it"),
    ),
    // A lone untitled table (most adjectives and nouns) needs no disclosure wrapper.
    tables.length === 1 && tables[0]!.title === "Forms"
      ? renderTable(doc, tables[0]!, result.query, result.lang, say)
      : tables.map((t) =>
          h(doc, "details", { class: "lh-table", open: openIds.has(t.id) },
            h(doc, "summary", {}, t.title),
            renderTable(doc, t, result.query, result.lang, say),
          ),
        ),
    other.length > 0 && h(doc, "dl", { class: "lh-other" },
      other.flatMap((o) => [
        h(doc, "dt", {}, o.label),
        h(doc, "dd", { lang: result.lang }, o.forms.flatMap((f, i) => [i > 0 ? ", " : null, say(f, f)])),
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

export interface RenderOptions extends InflectionOptions {
  /** Languages with an on-device voice, so a Listen button can work without a recording. */
  speechLanguages?: ReadonlySet<string>;
}

export interface RenderHandlers {
  /** Says something aloud, saying how; rejects with a message fit to show the user. */
  onListen: (speech: Speech) => Promise<Spoken>;
  /** Translates the looked-up text into a language whose tab is shown for the first time. */
  loadLanguage: (lang: string) => Promise<LanguageOutcome>;
  /** The user chose a language's tab, so that the next translation can open on it. */
  onChooseLanguage: (lang: string) => void;
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

/** A recording, or an on-device voice for the language: otherwise a Listen button would only fail. */
function canListen(speech: Speech, options: RenderOptions): boolean {
  return speech.recording !== undefined || (options.speechLanguages?.has(speech.lang) ?? false);
}

const SPOKEN_LABELS: Record<Spoken, string> = {
  recording: "Playing a native speaker's recording.",
  voice: "Reading it with your computer's voice.",
};

const clearTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Says something aloud and always says what happened in `status`: playing,
 * then how, or why it couldn't, so a press is never met with silence and no
 * explanation.
 */
function play(status: HTMLElement, speech: Speech, handlers: RenderHandlers): void {
  const show = (text: string, error = false) => {
    clearTimeout(clearTimers.get(status));
    status.textContent = text;
    status.classList.toggle("lh-listen-error", error);
  };
  show("Playing…");
  handlers.onListen(speech).then(
    (spoken) => {
      show(SPOKEN_LABELS[spoken]);
      clearTimers.set(status, setTimeout(() => show(""), 4000));
    },
    (e: unknown) => show(e instanceof Error ? e.message : String(e), true),
  );
}

/** A Listen button, with a status saying what it did. */
function listenControl(doc: Document, speech: Speech, handlers: RenderHandlers): HTMLElement {
  const status = h(doc, "span", { class: "lh-listen-status", role: "status" });
  const button = h(doc, "button", {
    type: "button",
    class: "lh-audio",
    "aria-label": `Listen to “${speech.text}”`,
    onclick: () => play(status, speech, handlers),
  }, "▶ Listen");
  return h(doc, "span", { class: "lh-listen" }, button, status);
}

/**
 * Words and forms as buttons that say them, announcing in `status`. A word
 * with a recording in `recordings` plays it; the rest need a voice for the
 * language, and without one stay plain text.
 */
function sayer(
  doc: Document,
  lang: string,
  recordings: Record<string, string>,
  handlers: RenderHandlers,
  options: RenderOptions,
  status: HTMLElement,
): Say {
  const voice = options.speechLanguages?.has(lang) ?? false;
  return (text, content) => {
    const recording = recordings[text];
    if (!voice && recording === undefined) return content;
    const speech: Speech = { text, lang, ...(recording ? { recording } : {}) };
    return h(doc, "button", {
      type: "button",
      class: "lh-say",
      lang,
      "aria-label": `Listen to “${text}”`,
      onclick: () => play(status, speech, handlers),
    }, content);
  };
}

function renderExplain(
  doc: Document,
  result: ExplainResult,
  handlers: RenderHandlers,
  options: RenderOptions,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  const formOf = result.entries.flatMap((e) => e.formOf.map((f) => ({ ...f, pos: e.pos })));
  const shown = entriesToShow(result);
  const ipa = result.entries.find((e) => e.ipa)?.ipa;
  // Only a recording of the selected word itself: a lemma's would say a different word ("manger" for "mange").
  const selected = result.query.toLocaleLowerCase();
  const recording = result.entries.find((e) => e.audioUrl && e.word.toLocaleLowerCase() === selected)?.audioUrl;
  const speech: Speech = { text: result.query, lang: result.lang, ...(recording ? { recording } : {}) };
  const listenable = canListen(speech, options);

  const header: (Node | false | undefined)[] = [
    Boolean(ipa || listenable) && h(doc, "div", { class: "lh-pronunciation" },
      ipa && h(doc, "span", { class: "lh-ipa" }, ipa),
      listenable && listenControl(doc, speech, handlers),
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

  for (const entry of shown) frag.append(renderEntry(doc, entry, result, options, handlers));

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
  const others = result.languages ?? [];
  if (others.length === 0) {
    fillFooter(doc, end, link, credits);
    frag.append(end);
    return frag;
  }

  // Other languages being learned follow the explanation, each in its own tab,
  // translated from the text when first shown. The explanation comes first:
  // it's in the user's own language.
  const loaded: LanguageTranslation[] = [];
  const updateFooter = () => fillFooter(doc, end, link, {
    wiktionary: credits.wiktionary || loaded.some(showsDictionary),
    machine: credits.machine || loaded.some((l) => l.machine !== undefined),
  });
  const sections = others.map((lang) => new LanguageSection(
    doc,
    lang,
    languageByCode(lang)?.name ?? lang,
    (t) => renderLanguagePanel(doc, t, result.query, handlers, options),
    (t) => {
      loaded.push(t);
      updateFooter();
    },
  ));
  const nativeName = (result.native && languageByCode(result.native)?.name) ?? "Meaning";
  const explanation = [...frag.childNodes];
  const tabbed = doc.createDocumentFragment();
  tabbed.append(renderTabs(doc, [nativeName, ...sections.map((s) => s.name)], 0, (i, panel, chosen) => {
    if (i === 0) {
      if (!panel.hasChildNodes()) panel.append(...explanation);
      return;
    }
    sections[i - 1]!.mount(panel);
    sections[i - 1]!.load(handlers.loadLanguage, { retry: chosen });
  }));
  updateFooter();
  tabbed.append(end);
  return tabbed;
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

function translationWord(doc: Document, w: LanguageTranslation["senses"][number]["words"][number], lang: string, say: Say) {
  const grammar = w.tags.filter((t) => TAG_LABELS[t]).map((t) => TAG_LABELS[t]);
  const usage = w.tags.filter((t) => !TAG_LABELS[t]).map((t) => t.replace(/-/g, " "));
  return h(doc, "span", { class: "lh-tr-word" },
    h(doc, "strong", { lang }, say(w.word, w.word)),
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
  options: RenderOptions,
): Node[] {
  // A phrase's translation is a phrase too, which Wiktionary won't have a page for.
  // Without a lead word there's no single page to point to.
  const linkWord = isDictionaryCandidate(query) && t.lead !== undefined ? t.entry?.word ?? t.lead : undefined;
  const showPos = new Set(t.senses.map((s) => s.pos)).size > 1;
  // Say the main translation, or the machine translation of a phrase.
  const sayText = t.lead ?? t.machine;
  const recording = t.entry && t.entry.word === t.lead ? t.entry.audioUrl : undefined;
  const speech: Speech | undefined = sayText ? { text: sayText, lang: t.lang, ...(recording ? { recording } : {}) } : undefined;
  const listenable = speech !== undefined && canListen(speech, options);
  // Each translation can be listened to, not only the main one.
  const wordStatus = h(doc, "p", { class: "lh-listen-status", role: "status" });
  const say = sayer(doc, t.lang, recording && t.lead ? { [t.lead]: recording } : {}, handlers, options, wordStatus);
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
          s.words.flatMap((w, i) => [i > 0 ? ", " : null, translationWord(doc, w, t.lang, say)]),
        ),
      ),
    ),
    t.senses.length > 0 && wordStatus,
    Boolean(t.entry?.ipa || listenable) && h(doc, "div", { class: "lh-pronunciation" },
      t.entry?.ipa && h(doc, "span", { class: "lh-ipa" }, t.entry.ipa),
      listenable && speech && listenControl(doc, speech, handlers),
    ),
    t.entry && renderEntry(doc, t.entry, { query: t.lead ?? t.entry.word, lang: t.lang, sensesShown: 2 }, options, handlers),
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
 * between tabs, and Tab moves into the panel. Panels start empty; `onShow`
 * fills one when its tab is selected, `chosen` saying whether the user did that.
 */
function renderTabs(
  doc: Document,
  labels: string[],
  initial: number,
  onShow: (index: number, panel: HTMLElement, chosen: boolean) => void,
): HTMLElement {
  const prefix = `lh-tabs-${++tabsRendered}`;
  const tabs: HTMLButtonElement[] = [];
  const panelEls: HTMLElement[] = [];

  const select = (index: number, opts: { focus: boolean; chosen: boolean }) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panelEls[i]!.hidden = !selected;
    });
    if (opts.focus) tabs[index]!.focus();
    onShow(index, panelEls[index]!, opts.chosen);
  };

  labels.forEach((label, i) => {
    tabs.push(h(doc, "button", {
      type: "button",
      role: "tab",
      id: `${prefix}-tab-${i}`,
      "aria-controls": `${prefix}-panel-${i}`,
      onclick: () => select(i, { focus: false, chosen: true }),
    }, label));
    panelEls.push(h(doc, "div", {
      role: "tabpanel",
      id: `${prefix}-panel-${i}`,
      "aria-labelledby": `${prefix}-tab-${i}`,
      tabindex: "0",
      class: "lh-tabpanel",
    }));
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
      select((next + tabs.length) % tabs.length, { focus: true, chosen: true });
    },
  }, tabs);
  select(initial, { focus: false, chosen: false });
  return h(doc, "div", { class: "lh-tabs" }, tablist, panelEls);
}

/**
 * One language's part of a translation, filled in when it's first shown.
 * Its status region announces loading and failure; once loaded, its content
 * stays, so showing it again fetches nothing. A failure is retried when the
 * user next chooses its tab.
 */
class LanguageSection {
  readonly #status: HTMLElement;
  readonly #body: HTMLElement;
  #state: "empty" | "loading" | "loaded" | "failed" = "empty";

  constructor(
    doc: Document,
    readonly lang: string,
    readonly name: string,
    private readonly render: (t: LanguageTranslation) => Node[],
    private readonly onLoaded: (t: LanguageTranslation) => void,
  ) {
    this.#status = h(doc, "div", { class: "lh-status lh-panel-status", role: "status" });
    this.#body = h(doc, "div", {});
  }

  /** Puts the section into its container: a tab panel, or the popup itself for a single language. */
  mount(container: HTMLElement | DocumentFragment): void {
    if (this.#status.parentNode !== container) container.append(this.#status, this.#body);
  }

  show(outcome: LanguageOutcome): void {
    if (outcome.ok) {
      this.#state = "loaded";
      this.#setStatus("", false);
      this.#body.replaceChildren(...this.render(outcome.result));
      this.onLoaded(outcome.result);
    } else {
      this.#state = "failed";
      this.#setStatus(outcome.error, true);
      this.#body.replaceChildren();
    }
  }

  load(loadLanguage: RenderHandlers["loadLanguage"], opts: { retry: boolean }): void {
    if (this.#state === "loading" || this.#state === "loaded" || (this.#state === "failed" && !opts.retry)) return;
    this.#state = "loading";
    this.#setStatus(`Translating into ${this.name}…`, false);
    loadLanguage(this.lang).then(
      (outcome) => this.show(outcome),
      (e: unknown) => this.show({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
  }

  #setStatus(text: string, failed: boolean): void {
    this.#status.textContent = text;
    this.#status.classList.toggle("lh-failed", failed);
  }
}

function renderTranslate(
  doc: Document,
  result: TranslateResult,
  handlers: RenderHandlers,
  options: RenderOptions,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  if (result.source) {
    frag.append(h(doc, "p", { class: "lh-formof" },
      `${result.source.description} of `,
      h(doc, "strong", { lang: result.lang }, result.source.lemma),
    ));
  }

  // Credits follow what's on screen, which grows as tabs load.
  const link = isDictionaryCandidate(result.query) ? wiktionaryLink(doc, result.source?.lemma ?? result.query, result.lang) : undefined;
  const end = h(doc, "footer", {});
  const loaded: LanguageTranslation[] = [];
  const updateFooter = () => fillFooter(doc, end, link, {
    wiktionary: Boolean(result.source) || loaded.some(showsDictionary),
    machine: loaded.some((l) => l.machine !== undefined),
  });

  const sections = result.languages.map((lang) => new LanguageSection(
    doc,
    lang,
    languageByCode(lang)?.name ?? lang,
    (t) => renderLanguagePanel(doc, t, result.query, handlers, options),
    (t) => {
      loaded.push(t);
      updateFooter();
    },
  ));
  const firstIndex = Math.max(0, result.languages.findIndex((l) => l === result.first?.lang));
  if (result.first) sections[firstIndex]?.show(result.first.outcome);

  if (sections.length === 1) {
    sections[0]!.mount(frag);
    sections[0]!.load(handlers.loadLanguage, { retry: false });
  } else if (sections.length > 1) {
    frag.append(renderTabs(doc, sections.map((s) => s.name), firstIndex, (i, panel, chosen) => {
      const section = sections[i]!;
      section.mount(panel);
      section.load(handlers.loadLanguage, { retry: chosen });
      if (chosen) handlers.onChooseLanguage(section.lang);
    }));
  } else {
    frag.append(h(doc, "p", { class: "lh-empty" }, "Choose the languages you're learning in Settings."));
  }

  if (result.warnings.length > 0) {
    frag.append(h(doc, "ul", { class: "lh-warnings" }, result.warnings.map((w) => h(doc, "li", {}, w))));
  }
  updateFooter();
  frag.append(end);
  return frag;
}
