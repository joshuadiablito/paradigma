// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseKaikki } from "../shared/kaikki";
import type { ExplainResult, LanguageOutcome, LanguageTranslation, TranslateResult } from "../shared/types";
import { fixture } from "../test/fixtures";
import type { Speech } from "../shared/speech";
import { entriesToShow, renderResult, type RenderOptions } from "./render";

const result = (over: Partial<ExplainResult>): ExplainResult => ({
  kind: "explain",
  query: "mange",
  lang: "fr",
  entries: parseKaikki(fixture("french-mange")),
  lemmas: parseKaikki(fixture("french-manger")),
  warnings: [],
  ...over,
});

function render(r: ExplainResult, options: RenderOptions = {}, onListen = vi.fn(async (_: Speech) => {})) {
  const root = document.createElement("div");
  root.append(renderResult(document, r, { onListen, loadLanguage: vi.fn(), onChooseLanguage: vi.fn() }, options));
  return root;
}

describe("renderResult: explaining a word in a language being learned", () => {
  it("explains an inflected form in terms of its lemma", () => {
    const root = render(result({}));
    expect(root.querySelector(".lh-formof")?.textContent).toContain("first/third-person singular present indicative/subjunctive of manger");
    expect(root.querySelector(".lh-entry h3")?.textContent).toContain("manger");
    expect(root.querySelector(".lh-senses")?.textContent).toContain("to eat");
  });

  it("shows only the lemma with the same part of speech as the selected form", () => {
    expect(entriesToShow(result({})).map((e) => e.pos)).toEqual(["verb"]);
  });

  it("opens the present and the table containing the selected form, and highlights it", () => {
    const root = render(result({ query: "mangeait" }));
    const open = [...root.querySelectorAll("details.lh-table[open]")];
    expect(open.map((d) => d.querySelector("summary")?.textContent)).toEqual(["Indicative present", "Indicative imperfect"]);
    expect(open[1]?.querySelector("mark")?.textContent).toBe("mangeait");
  });

  it("gives tables header cells with scope for screen readers", () => {
    const table = render(result({})).querySelector("details.lh-table table")!;
    expect(table.querySelector("caption")?.textContent).toBeTruthy();
    expect([...table.querySelectorAll("thead th")].every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect([...table.querySelectorAll("tbody th")].every((th) => th.getAttribute("scope") === "row")).toBe(true);
  });

  it("marks foreign-language text with its language for screen readers", () => {
    const root = render(result({}));
    expect(root.querySelector("td")?.getAttribute("lang")).toBe("fr");
  });

  it("shows the translation and its provider", () => {
    const root = render(result({ translation: { text: "eat", provider: "MyMemory" } }));
    expect(root.querySelector(".lh-translation")?.textContent).toBe("Machine translation: eat");
    expect(root.querySelector("footer")?.textContent).toContain("MyMemory");
  });

  it("renders provider text as text, never as HTML", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const root = render(result({ query: evil, entries: [], lemmas: [], translation: { text: evil, provider: "MyMemory" } }));
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain(evil);
  });

  it("says so when nothing was found", () => {
    const root = render(result({ entries: [], lemmas: [] }));
    expect(root.textContent).toContain("No dictionary entry found.");
  });

  it("shows warnings from a provider that failed", () => {
    const root = render(result({ warnings: ["Translation unavailable: MyMemory responded 500"] }));
    expect(root.querySelector(".lh-warnings")?.textContent).toContain("MyMemory responded 500");
  });

  it("links to the Wiktionary entry for the lemma, in the right language section", () => {
    const href = render(result({})).querySelector("footer a")?.getAttribute("href");
    expect(href).toBe("https://en.wiktionary.org/wiki/manger#French");
    expect(render(result({})).querySelector("footer a")?.textContent).toBe("Open “manger” in Wiktionary");
  });

  it("doesn't link a phrase to Wiktionary, which has no page for it, and credits only the translation", () => {
    const root = render(result({
      query: "je voudrais manger une pomme",
      entries: [],
      lemmas: [],
      translation: { text: "I would like to eat an apple", provider: "MyMemory" },
    }));
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("footer")?.textContent).toBe("Data: MyMemory");
  });

  it("credits Wiktionary only when it showed something", () => {
    const found = render(result({})).querySelector("footer")?.textContent;
    expect(found).toContain("Wiktionary via kaikki.org");
    expect(found).not.toContain("MyMemory");
    const missing = render(result({ entries: [], lemmas: [], translation: { text: "eats", provider: "MyMemory" } }));
    expect(missing.querySelector("footer")?.textContent).toBe("Open “mange” in Wiktionary · Data: MyMemory");
  });
});

describe("renderResult: translating from the user's language", () => {
  const french: LanguageTranslation = {
    lang: "fr",
    senses: [{ pos: "verb", sense: "to ingest", words: [{ word: "manger", tags: [] }, { word: "bouffer", tags: ["slang"] }] }],
    lead: "manger",
    entry: parseKaikki(fixture("french-manger")).find((e) => e.pos === "verb")!,
  };
  const spanish: LanguageTranslation = {
    lang: "es",
    senses: [{ pos: "verb", sense: "to ingest", words: [{ word: "comer", tags: [] }] }],
    lead: "comer",
    entry: parseKaikki(fixture("spanish-comer")).find((e) => e.pos === "verb")!,
  };

  /** A translate result whose first language comes with it; the rest are served by `loadLanguage`. */
  const translation = (languages: LanguageTranslation[], over: Partial<TranslateResult> = {}): TranslateResult => ({
    kind: "translate",
    query: "eat",
    lang: "en",
    languages: languages.map((l) => l.lang),
    ...(languages[0] ? { first: { lang: languages[0].lang, outcome: { ok: true, result: languages[0] } } } : {}),
    warnings: [],
    ...over,
  });

  /** Renders a translation, serving each other language once its load is released. */
  function renderTranslation(languages: LanguageTranslation[], over: Partial<TranslateResult> = {}) {
    const pending = new Map<string, (outcome: LanguageOutcome) => void>();
    const loadLanguage = vi.fn((lang: string) => new Promise<LanguageOutcome>((resolve) => pending.set(lang, resolve)));
    const onChooseLanguage = vi.fn();
    const root = document.createElement("div");
    root.append(renderResult(document, translation(languages, over), { onListen: vi.fn(async () => {}), loadLanguage, onChooseLanguage }));
    document.body.replaceChildren(root);
    const tabs = [...root.querySelectorAll<HTMLElement>("[role=tab]")];
    const panels = [...root.querySelectorAll<HTMLElement>("[role=tabpanel]")];
    /** Answers a language's load, and waits for it to render. */
    const release = async (lang: string, outcome?: LanguageOutcome) => {
      pending.get(lang)!(outcome ?? { ok: true, result: languages.find((l) => l.lang === lang)! });
      await new Promise((r) => setTimeout(r, 0));
    };
    return { root, tabs, panels, loadLanguage, onChooseLanguage, release };
  }

  /** Renders with every language already loaded, by choosing each tab in turn. */
  async function renderLoaded(languages: LanguageTranslation[], over: Partial<TranslateResult> = {}) {
    const r = renderTranslation(languages, over);
    for (const [i, l] of languages.entries()) {
      if (i === 0) continue;
      r.tabs[i]!.click();
      await r.release(l.lang);
    }
    return r;
  }

  const press = (key: string) =>
    document.querySelector("[role=tablist]")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

  it("gives each language a tab, with the first selected", () => {
    const { tabs, panels } = renderTranslation([french, spanish]);
    expect(tabs.map((t) => t.textContent)).toEqual(["French", "Spanish"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(panels.map((p) => p.hidden)).toEqual([false, true]);
    expect(panels[0]?.getAttribute("aria-labelledby")).toBe(tabs[0]?.id);
  });

  it("opens on the language the result starts with, keeping the tabs in order", () => {
    const { tabs, panels, loadLanguage } = renderTranslation([french, spanish], {
      first: { lang: "es", outcome: { ok: true, result: spanish } },
    });
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(panels[1]?.textContent).toContain("comer");
    expect(loadLanguage).not.toHaveBeenCalled();
  });

  it("moves between tabs with the arrow keys, wrapping around", () => {
    const { tabs } = renderTranslation([french, spanish]);
    press("ArrowRight");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0]);
    press("ArrowRight");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    press("End");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    press("Home");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("loads a language only when its tab is first shown, announcing that it's loading", async () => {
    const { tabs, panels, loadLanguage, release } = renderTranslation([french, spanish]);
    expect(loadLanguage).not.toHaveBeenCalled();
    expect(panels[1]?.textContent).toBe("");

    tabs[1]!.click();
    expect(loadLanguage.mock.calls).toEqual([["es"]]);
    const status = panels[1]!.querySelector("[role=status]")!;
    expect(status.textContent).toBe("Translating into Spanish…");

    await release("es");
    expect(status.textContent).toBe("");
    expect(panels[1]?.querySelector(".lh-entry h3")?.textContent).toContain("comer");
  });

  it("doesn't load a language again when its tab is shown again", async () => {
    const { tabs, panels, loadLanguage, release } = renderTranslation([french, spanish]);
    tabs[1]!.click();
    tabs[1]!.click(); // still loading
    await release("es");
    tabs[0]!.click();
    tabs[1]!.click();
    press("ArrowLeft");
    press("ArrowRight");
    expect(loadLanguage).toHaveBeenCalledTimes(1);
    expect(panels[1]?.textContent).toContain("comer");
  });

  it("loads a tab reached with the keyboard, and leaves focus on its tab when it arrives", async () => {
    const { tabs, panels, loadLanguage, release } = renderTranslation([french, spanish]);
    tabs[0]!.focus();
    press("ArrowRight");
    expect(loadLanguage.mock.calls).toEqual([["es"]]);
    await release("es");
    expect(document.activeElement).toBe(tabs[1]);
    expect(panels[1]?.textContent).toContain("comer");
  });

  it("shows a language's failure in its panel, and tries again when the tab is chosen again", async () => {
    const { tabs, panels, loadLanguage, release } = renderTranslation([french, spanish]);
    tabs[1]!.click();
    await release("es", { ok: false, error: "Translation unavailable: offline" });
    expect(panels[1]?.querySelector("[role=status]")?.textContent).toBe("Translation unavailable: offline");
    expect(panels[0]?.textContent).toContain("manger");
    tabs[0]!.click();
    tabs[1]!.click();
    expect(loadLanguage).toHaveBeenCalledTimes(2);
    await release("es");
    expect(panels[1]?.textContent).toContain("comer");
  });

  it("shows the first language's failure in its panel without loading it again", () => {
    const { panels, loadLanguage } = renderTranslation([french, spanish], {
      first: { lang: "fr", outcome: { ok: false, error: "Translation unavailable: offline" } },
    });
    expect(panels[0]?.querySelector("[role=status]")?.textContent).toBe("Translation unavailable: offline");
    expect(loadLanguage).not.toHaveBeenCalled();
  });

  it("remembers the tab the user chooses, but not the one it opened on", async () => {
    const { tabs, onChooseLanguage } = renderTranslation([french, spanish]);
    expect(onChooseLanguage).not.toHaveBeenCalled();
    tabs[1]!.click();
    expect(onChooseLanguage).toHaveBeenLastCalledWith("es");
    press("ArrowLeft");
    expect(onChooseLanguage).toHaveBeenLastCalledWith("fr");
  });

  it("lists translations by meaning, with usage labels, in the target language", () => {
    const panel = renderTranslation([french, spanish]).panels[0]!;
    expect(panel.querySelector(".lh-tr-senses")?.textContent).toBe("to ingest: manger, bouffer (slang)");
    expect(panel.querySelector(".lh-tr-word strong")?.getAttribute("lang")).toBe("fr");
  });

  it("shows the main translation's conjugation, opening the present with every person", async () => {
    const panel = (await renderLoaded([french, spanish])).panels[1]!;
    expect(panel.querySelector(".lh-entry h3")?.textContent).toContain("comer");
    const open = panel.querySelector("details.lh-table[open]")!;
    expect(open.querySelector("summary")?.textContent).toBe("Indicative present");
    expect(open.textContent).toContain("comemos");
    expect(open.textContent).toContain("comen");
  });

  it("links each language's word to its own Wiktionary entry", async () => {
    const { panels } = await renderLoaded([french, spanish]);
    expect(panels[0]?.querySelector("a.lh-wikt")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/manger#French");
    expect(panels[1]?.querySelector("a.lh-wikt")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/comer#Spanish");
  });

  it("says when Wiktionary has no entry for the translation, rather than showing nothing", () => {
    const { root } = renderTranslation([{ lang: "el", senses: [], machine: "αναδημοσιεύτηκε", lead: "αναδημοσιεύτηκε" }]);
    expect(root.textContent).toContain("Wiktionary has no entry for “αναδημοσιεύτηκε”, so its forms can't be shown.");
    expect(root.querySelector("a.lh-wikt")?.getAttribute("href")).toContain("#Greek");
  });

  it("says when Wiktionary has the word but no table of its forms", () => {
    const stub = { word: "αναδημοσιεύω", pos: "verb", senses: [{ gloss: "to republish", tags: [] }], forms: [], formOf: [], translations: [] };
    const { root } = renderTranslation([{ lang: "el", senses: [], machine: "αναδημοσιεύω", lead: "αναδημοσιεύω", entry: stub }]);
    expect(root.textContent).toContain("Wiktionary has no table of forms for “αναδημοσιεύω” yet.");
  });

  it("names the base form when that is what was machine-translated", () => {
    const { root } = renderTranslation([{ lang: "es", senses: [], machine: "republicar", machineOf: "republish" }], { query: "republished" });
    expect(root.querySelector(".lh-translation")?.textContent).toBe("Machine translation of “republish”: republicar");
  });

  it("abbreviates gender, with the full word available", () => {
    const { root } = renderTranslation(
      [{ lang: "fr", senses: [{ pos: "noun", sense: "abode", words: [{ word: "maison", tags: ["feminine"] }] }] }],
      { query: "house" },
    );
    const abbr = root.querySelector("abbr")!;
    expect(abbr.textContent?.trim()).toBe("f");
    expect(abbr.getAttribute("title")).toBe("feminine");
  });

  it("needs no tabs for a single language", () => {
    const { root, loadLanguage } = renderTranslation([french]);
    expect(root.querySelector("[role=tablist]")).toBeNull();
    expect(root.textContent).toContain("manger");
    expect(loadLanguage).not.toHaveBeenCalled();
  });

  it("asks for the languages being learned when there are none", () => {
    const { root } = renderTranslation([]);
    expect(root.textContent).toContain("Choose the languages you're learning in Settings.");
  });

  it("labels machine translations of phrases", () => {
    const { root } = renderTranslation([{ lang: "es", senses: [], machine: "buenos días" }], { query: "good morning" });
    expect(root.querySelector(".lh-translation")?.textContent).toBe("Machine translation: buenos días");
    expect(root.querySelector("footer")?.textContent).toContain("MyMemory");
  });

  it("says which word an inflected form comes from", () => {
    const { root } = renderTranslation([french, spanish], { query: "ate", source: { lemma: "eat", description: "simple past" } });
    expect(root.querySelector(".lh-formof")?.textContent).toBe("simple past of eat");
    expect(root.querySelector("footer a")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/eat#English");
  });

  it("doesn't link a phrase or its translations to Wiktionary, and credits only MyMemory", async () => {
    const { root } = await renderLoaded([
      { lang: "fr", senses: [], machine: "parce qu'il faisait beau" },
      { lang: "es", senses: [], machine: "porque hacía buen tiempo" },
    ], { query: "because the weather was lovely" });
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).not.toContain("Wiktionary");
    expect(root.querySelector("footer")?.textContent).toBe("Data: MyMemory");
  });

  it("doesn't link a language to Wiktionary when it has no lead word", () => {
    const { root } = renderTranslation([{ lang: "es", senses: [], machine: "comer algo" }], { query: "chow" });
    expect(root.querySelector(".lh-wikt-row")).toBeNull();
    expect(root.querySelector("footer a")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/chow#English");
  });

  it("credits Wiktionary but not MyMemory when only dictionary translations are shown", () => {
    const { root } = renderTranslation([french, spanish]);
    expect(root.querySelector("footer")?.textContent).toBe("Open “eat” in Wiktionary · Data: Wiktionary via kaikki.org (CC BY-SA)");
  });

  it("adds a credit when a tab that loads later shows another provider's data", async () => {
    const { root, tabs, release } = renderTranslation([french, { lang: "es", senses: [], machine: "comer algo" }]);
    expect(root.querySelector("footer")?.textContent).not.toContain("MyMemory");
    tabs[1]!.click();
    await release("es");
    expect(root.querySelector("footer")?.textContent).toContain("Wiktionary via kaikki.org (CC BY-SA), MyMemory");
  });

  it("renders provider text in a loaded tab as text, never as HTML", async () => {
    const evil = '<img src=x onerror="alert(1)">';
    const { root } = await renderLoaded([french, { lang: "es", senses: [], machine: evil }]);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain(evil);
  });
});

describe("renderResult: listening", () => {
  const explainResult = (over: Partial<ExplainResult>): ExplainResult => ({
    kind: "explain",
    query: "mange",
    lang: "fr",
    entries: parseKaikki(fixture("french-mange")),
    lemmas: parseKaikki(fixture("french-manger")),
    warnings: [],
    ...over,
  });
  const listenButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("button.lh-audio");

  it("plays a native speaker's recording of the selected word, labelled with what it says", () => {
    const onListen = vi.fn(async (_: Speech) => {});
    const button = listenButton(render(explainResult({}), {}, onListen))!;
    expect(button.getAttribute("aria-label")).toBe("Listen to “mange”");
    button.click();
    expect(onListen).toHaveBeenCalledWith(expect.objectContaining({ text: "mange", lang: "fr", recording: expect.stringMatching(/^https:\/\/upload\.wikimedia\.org\//) }));
  });

  it("never plays the lemma's recording for an inflected form, which would say a different word", () => {
    const withoutOwnRecording = parseKaikki(fixture("french-mange")).map(({ audioUrl: _, ...e }) => e);
    const onListen = vi.fn(async (_: Speech) => {});
    const root = render(explainResult({ entries: withoutOwnRecording }), { speechLanguages: new Set(["fr"]) }, onListen);
    listenButton(root)!.click();
    expect(onListen).toHaveBeenCalledWith({ text: "mange", lang: "fr" });
  });

  it("offers a Listen button without a recording only when there's a voice for the language", () => {
    const comer = explainResult({ query: "comer", lang: "es", entries: parseKaikki(fixture("spanish-comer")), lemmas: [] });
    expect(listenButton(render(comer))).toBeNull();
    expect(listenButton(render(comer, { speechLanguages: new Set(["fr"]) }))).toBeNull();
    expect(listenButton(render(comer, { speechLanguages: new Set(["es"]) }))).not.toBeNull();
  });

  it("reads a phrase aloud too", () => {
    const onListen = vi.fn(async (_: Speech) => {});
    const phrase = explainResult({ query: "je voudrais une pomme", entries: [], lemmas: [] });
    listenButton(render(phrase, { speechLanguages: new Set(["fr"]) }, onListen))!.click();
    expect(onListen).toHaveBeenCalledWith({ text: "je voudrais une pomme", lang: "fr" });
  });

  it("announces why it couldn't be read aloud", async () => {
    const onListen = vi.fn(async () => { throw new Error("This computer has no Spanish voice to read it aloud."); });
    const root = render(explainResult({}), {}, onListen);
    listenButton(root)!.click();
    await new Promise((r) => setTimeout(r, 0));
    const status = root.querySelector(".lh-listen-status")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("This computer has no Spanish voice to read it aloud.");
  });

  function renderFirstLanguage(language: LanguageTranslation, options: RenderOptions = {}) {
    const onListen = vi.fn(async (_: Speech) => {});
    const result: TranslateResult = {
      kind: "translate",
      query: "eat",
      lang: "en",
      languages: [language.lang],
      first: { lang: language.lang, outcome: { ok: true, result: language } },
      warnings: [],
    };
    const root = document.createElement("div");
    root.append(renderResult(document, result, { onListen, loadLanguage: vi.fn(), onChooseLanguage: vi.fn() }, options));
    return { root, onListen };
  }

  it("says the main translation, with its recording when Wiktionary has one", () => {
    const manger = parseKaikki(fixture("french-manger")).find((e) => e.pos === "verb")!;
    const { root, onListen } = renderFirstLanguage({ lang: "fr", senses: [], lead: "manger", entry: manger });
    listenButton(root)!.click();
    expect(onListen).toHaveBeenCalledWith(expect.objectContaining({ text: "manger", lang: "fr", recording: manger.audioUrl }));
  });

  it("says a phrase's machine translation in the language being learned", () => {
    const { root, onListen } = renderFirstLanguage({ lang: "es", senses: [], machine: "buenos días" }, { speechLanguages: new Set(["es"]) });
    listenButton(root)!.click();
    expect(onListen).toHaveBeenCalledWith({ text: "buenos días", lang: "es" });
  });
});
