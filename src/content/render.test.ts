// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseKaikki } from "../shared/kaikki";
import type { LookupResult } from "../shared/types";
import { fixture } from "../test/fixtures";
import { entriesToShow, renderResult } from "./render";

const result = (over: Partial<LookupResult>): LookupResult => ({
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

describe("renderResult", () => {
  it("explains an inflected form in terms of its lemma", () => {
    const root = render(result({}));
    expect(root.querySelector(".lh-formof")?.textContent).toContain("first/third-person singular present indicative/subjunctive of manger");
    expect(root.querySelector(".lh-entry h3")?.textContent).toContain("manger");
    expect(root.querySelector(".lh-senses")?.textContent).toContain("to eat");
  });

  it("shows only the lemma with the same part of speech as the hovered form", () => {
    expect(entriesToShow(result({})).map((e) => e.pos)).toEqual(["verb"]);
  });

  it("opens the table containing the hovered form and highlights it", () => {
    const root = render(result({ query: "mangeait" }));
    const open = root.querySelectorAll("details.lh-table[open]");
    expect(open).toHaveLength(1);
    expect(open[0]?.querySelector("summary")?.textContent).toBe("Indicative imperfect");
    expect(open[0]?.querySelector("mark")?.textContent).toBe("mangeait");
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
  });
});
