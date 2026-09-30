import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import { resolvePageLanguage, resolveTextLanguage } from "./activation";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, learning: ["fr", "es"], ...over });
const page = (htmlLang: string | null, detected: string | null, s = settings(), host = "example.com") =>
  resolvePageLanguage({ host, htmlLang, detected, settings: s });

describe("resolvePageLanguage", () => {
  it("activates on a page declared in a learning language, including regional tags", () => {
    expect(page("fr-CA", null)).toEqual({ lang: "fr", reason: "page-lang" });
  });

  it("falls back to detection when the page declares another language", () => {
    expect(page("en", "es")).toEqual({ lang: "es", reason: "detected" });
  });

  it("stays off for languages not being learned", () => {
    expect(page("de", "de")).toEqual({ lang: null, reason: "not-learning" });
  });

  it("stays off until a language is chosen", () => {
    expect(page("fr", "fr", settings({ learning: [] }))).toEqual({ lang: null, reason: "no-languages" });
  });

  it("lets a site rule override detection either way", () => {
    const s = settings({ sites: { "a.test": { mode: "on", lang: "es" }, "b.test": { mode: "off" } } });
    expect(page("en", "en", s, "a.test")).toEqual({ lang: "es", reason: "site-on" });
    expect(page("fr", "fr", s, "b.test")).toEqual({ lang: null, reason: "site-off" });
  });
});

describe("resolveTextLanguage", () => {
  const text = (elementLang: string | null, p = page("en", "en"), htmlLang = "en") =>
    resolveTextLanguage({ page: p, elementLang, htmlLang, settings: settings() });

  it("activates for a passage marked as a learning language on an English page", () => {
    expect(text("fr")).toBe("fr");
  });

  it("uses the page language for unmarked text", () => {
    expect(text(null, page("fr", null), "fr")).toBe("fr");
  });

  it("ignores a passage explicitly marked as a language not being learned", () => {
    expect(text("de", page("fr", null), "fr")).toBeNull();
  });

  it("treats a wrapper that repeats the page's lang as unmarked, so detection still applies", () => {
    expect(text("en", page("en", "fr"))).toBe("fr");
  });
});
