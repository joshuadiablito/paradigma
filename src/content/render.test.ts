// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseKaikki } from "../shared/kaikki";
import type { ExplainResult, LookupResult, TranslateResult } from "../shared/types";
import { fixture } from "../test/fixtures";
import { entriesToShow, renderResult } from "./render";

const result = (over: Partial<ExplainResult>): ExplainResult => ({
  kind: "explain",
  query: "mange",
  lang: "fr",
  entries: parseKaikki(fixture("french-mange")),
  lemmas: parseKaikki(fixture("french-manger")),
  warnings: [],
  ...over,
});

function render(r: LookupResult) {
  const root = document.createElement("div");
  root.append(renderResult(document, r, { onPlayAudio: vi.fn() }));
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
});

describe("renderResult: translating from the user's language", () => {
  const translation = (over: Partial<TranslateResult> = {}): TranslateResult => ({
    kind: "translate",
    query: "eat",
    lang: "en",
    languages: [
      {
        lang: "fr",
        senses: [{ pos: "verb", sense: "to ingest", words: [{ word: "manger", tags: [] }, { word: "bouffer", tags: ["slang"] }] }],
        lead: "manger",
        entry: parseKaikki(fixture("french-manger")).find((e) => e.pos === "verb")!,
      },
      {
        lang: "es",
        senses: [{ pos: "verb", sense: "to ingest", words: [{ word: "comer", tags: [] }] }],
        lead: "comer",
        entry: parseKaikki(fixture("spanish-comer")).find((e) => e.pos === "verb")!,
      },
    ],
    warnings: [],
    ...over,
  });

  it("gives each language a tab, with the first selected", () => {
    const root = render(translation());
    const tabs = [...root.querySelectorAll("[role=tab]")];
    expect(tabs.map((t) => t.textContent)).toEqual(["French", "Spanish"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    const panels = [...root.querySelectorAll<HTMLElement>("[role=tabpanel]")];
    expect(panels.map((p) => p.hidden)).toEqual([false, true]);
    expect(panels[0]?.getAttribute("aria-labelledby")).toBe(tabs[0]?.id);
  });

  it("moves between tabs with the arrow keys, wrapping around", () => {
    document.body.replaceChildren(render(translation()));
    const tabs = [...document.querySelectorAll<HTMLElement>("[role=tab]")];
    const press = (key: string) =>
      document.querySelector("[role=tablist]")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    press("ArrowRight");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0]);
    press("ArrowRight");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    press("End");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("lists translations by meaning, with usage labels, in the target language", () => {
    const panel = render(translation()).querySelector("[role=tabpanel]")!;
    expect(panel.querySelector(".lh-tr-senses")?.textContent).toBe("to ingest: manger, bouffer (slang)");
    expect(panel.querySelector(".lh-tr-word strong")?.getAttribute("lang")).toBe("fr");
  });

  it("shows the main translation's conjugation, opening the present with every person", () => {
    const panel = render(translation()).querySelectorAll("[role=tabpanel]")[1]!;
    expect(panel.querySelector(".lh-entry h3")?.textContent).toContain("comer");
    const open = panel.querySelector("details.lh-table[open]")!;
    expect(open.querySelector("summary")?.textContent).toBe("Indicative present");
    expect(open.textContent).toContain("comemos");
    expect(open.textContent).toContain("comen");
  });

  it("links each language's word to its own Wiktionary entry", () => {
    const panels = render(translation()).querySelectorAll("[role=tabpanel]");
    expect(panels[0]?.querySelector("a.lh-wikt")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/manger#French");
    expect(panels[1]?.querySelector("a.lh-wikt")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/comer#Spanish");
  });

  it("says when Wiktionary has no entry for the translation, rather than showing nothing", () => {
    const root = render(translation({ languages: [{ lang: "el", senses: [], machine: "αναδημοσιεύτηκε", lead: "αναδημοσιεύτηκε" }] }));
    expect(root.textContent).toContain("Wiktionary has no entry for “αναδημοσιεύτηκε”, so its forms can't be shown.");
    expect(root.querySelector("a.lh-wikt")?.getAttribute("href")).toContain("#Greek");
  });

  it("says when Wiktionary has the word but no table of its forms", () => {
    const stub = { word: "αναδημοσιεύω", pos: "verb", senses: [{ gloss: "to republish", tags: [] }], forms: [], formOf: [], translations: [] };
    const root = render(translation({ languages: [{ lang: "el", senses: [], machine: "αναδημοσιεύω", lead: "αναδημοσιεύω", entry: stub }] }));
    expect(root.textContent).toContain("Wiktionary has no table of forms for “αναδημοσιεύω” yet.");
  });

  it("names the base form when that is what was machine-translated", () => {
    const root = render(translation({ query: "republished", languages: [{ lang: "es", senses: [], machine: "republicar", machineOf: "republish" }] }));
    expect(root.querySelector(".lh-translation")?.textContent).toBe("Machine translation of “republish”: republicar");
  });

  it("abbreviates gender, with the full word available", () => {
    const root = render(translation({
      query: "house",
      languages: [{ lang: "fr", senses: [{ pos: "noun", sense: "abode", words: [{ word: "maison", tags: ["feminine"] }] }] }],
    }));
    const abbr = root.querySelector("abbr")!;
    expect(abbr.textContent?.trim()).toBe("f");
    expect(abbr.getAttribute("title")).toBe("feminine");
  });

  it("needs no tabs for a single language", () => {
    const root = render(translation({ languages: [translation().languages[0]!] }));
    expect(root.querySelector("[role=tablist]")).toBeNull();
    expect(root.textContent).toContain("manger");
  });

  it("labels machine translations of phrases", () => {
    const root = render(translation({ query: "good morning", languages: [{ lang: "es", senses: [], machine: "buenos días" }] }));
    expect(root.querySelector(".lh-translation")?.textContent).toBe("Machine translation: buenos días");
    expect(root.querySelector("footer")?.textContent).toContain("MyMemory");
  });

  it("says which word an inflected form comes from", () => {
    const root = render(translation({ query: "ate", source: { lemma: "eat", description: "simple past" } }));
    expect(root.querySelector(".lh-formof")?.textContent).toBe("simple past of eat");
    expect(root.querySelector("footer a")?.getAttribute("href")).toBe("https://en.wiktionary.org/wiki/eat#English");
  });

  it("shows a language's warning without hiding the others", () => {
    const [fr] = translation().languages;
    const root = render(translation({ languages: [fr!, { lang: "es", senses: [], warning: "Translation unavailable: offline" }] }));
    expect(root.querySelectorAll("[role=tabpanel]")[1]?.textContent).toContain("Translation unavailable: offline");
  });
});
