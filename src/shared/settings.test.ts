import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sanitiseSettings } from "./settings";

describe("sanitiseSettings", () => {
  it("returns the defaults for empty storage", () => {
    expect(sanitiseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitiseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps known learning languages once each and drops unknown ones", () => {
    expect(sanitiseSettings({ learning: ["fr", "xx", "fr", 3, "de"] }).learning).toEqual(["fr", "de"]);
  });

  it("clamps the hover delay", () => {
    expect(sanitiseSettings({ hoverDelayMs: 5 }).hoverDelayMs).toBe(100);
    expect(sanitiseSettings({ hoverDelayMs: 99_999 }).hoverDelayMs).toBe(2000);
    expect(sanitiseSettings({ hoverDelayMs: "fast" }).hoverDelayMs).toBe(DEFAULT_SETTINGS.hoverDelayMs);
  });

  it("keeps valid site rules and drops invalid ones", () => {
    const { sites } = sanitiseSettings({
      sites: {
        "lemonde.fr": { mode: "on", lang: "fr" },
        "example.com": { mode: "off" },
        "bad.example": { mode: "on", lang: "klingon" },
        "worse.example": "yes",
      },
    });
    expect(sites).toEqual({ "lemonde.fr": { mode: "on", lang: "fr" }, "example.com": { mode: "off" } });
  });

  it("keeps a known Spanish variety and defaults to Spain's", () => {
    expect(sanitiseSettings({ spanishVariety: "rioplatense" }).spanishVariety).toBe("rioplatense");
    expect(sanitiseSettings({ spanishVariety: "mexico" }).spanishVariety).toBe("spain");
  });

  it("falls back to hover for an unknown trigger", () => {
    expect(sanitiseSettings({ trigger: "telepathy" }).trigger).toBe("hover");
    expect(sanitiseSettings({ trigger: "alt" }).trigger).toBe("alt");
  });

  it("keeps a plausible email address, trimmed", () => {
    expect(sanitiseSettings({ myMemoryEmail: "  ana@example.com " }).myMemoryEmail).toBe("ana@example.com");
    expect(sanitiseSettings({ myMemoryEmail: "a.b+lang@mail.example.co.uk" }).myMemoryEmail).toBe("a.b+lang@mail.example.co.uk");
  });

  it("drops an email address that isn't plausible", () => {
    for (const bad of ["", "ana", "ana@", "@example.com", "ana@example", "ana @example.com", "a@b@example.com", 42, null]) {
      expect(sanitiseSettings({ myMemoryEmail: bad }).myMemoryEmail).toBe("");
    }
  });
});
