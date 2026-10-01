import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import { resolvePageLanguage, resolveTextLanguage } from "./activation";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, learning: ["fr", "es"], ...over });
const page = (htmlLang: string | null, detected: string | null, s = settings(), host = "example.com") =>
  resolvePageLanguage({ host, htmlLang, detected, settings: s });

describe("resolvePageLanguage", () => {
  it("activates on a page in a learning language, including regional tags", () => {
    expect(page("fr-CA", null)).toEqual({ lang: "fr", reason: "page-lang" });
  });

  it("activates on a page in the user's own language", () => {
    expect(page("en-GB", null)).toEqual({ lang: "en", reason: "page-lang" });
  });

  it("falls back to detection when the page declares a language it isn't in", () => {
    expect(page("de", "es")).toEqual({ lang: "es", reason: "detected" });
  });

  it("assumes the user's own language when nothing can be said about the page", () => {
    expect(page(null, null)).toEqual({ lang: "en", reason: "assumed" });
  });

  it("stays off for languages that are neither the user's nor being learned", () => {
    expect(page("de", "de")).toEqual({ lang: null, reason: "not-learning" });
  });

  it("stays off until a language to learn is chosen", () => {
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

  it("uses a passage's own language when it's being learned", () => {
    expect(text("fr")).toBe("fr");
  });

  it("uses the page language for unmarked text", () => {
    expect(text(null, page("fr", null), "fr")).toBe("fr");
    expect(text(null)).toBe("en");
  });

  it("ignores a passage marked as a language that's neither the user's nor being learned", () => {
    expect(text("de", page("fr", null), "fr")).toBeNull();
  });

  it("treats a wrapper that repeats the page's lang as unmarked, so detection still applies", () => {
    expect(text("de", page("de", "fr"), "de")).toBe("fr");
  });
});
