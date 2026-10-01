import { describe, expect, it } from "vitest";
import { isRecordingUrl } from "../shared/speech";
import { speakableLanguages, voicesFor } from "./speech";

const voices = [
  { voiceName: "Google español", lang: "es-ES", remote: true },
  { voiceName: "Mónica", lang: "es-ES", remote: false },
  { voiceName: "Paulina", lang: "es-MX", remote: false },
  { voiceName: "Diego", lang: "es-AR", remote: false },
  { voiceName: "Thomas", lang: "fr-FR", remote: false },
  { voiceName: "Melina", lang: "el-GR", remote: false },
  { voiceName: "Google 日本語", lang: "ja-JP", remote: true },
];

describe("voicesFor", () => {
  it("never uses a remote voice, which would send the text to a speech service", () => {
    expect(voicesFor(voices, "ja")).toEqual([]);
    expect(voicesFor(voices, "es").every((v) => !v.remote)).toBe(true);
  });

  it("finds a language's voices whatever their region", () => {
    expect(voicesFor(voices, "el").map((v) => v.voiceName)).toEqual(["Melina"]);
  });

  it("prefers a Spanish voice from the variety being learned", () => {
    expect(voicesFor(voices, "es", "spain")[0]?.voiceName).toBe("Mónica");
    expect(voicesFor(voices, "es", "latin-america")[0]?.voiceName).toBe("Paulina");
    expect(voicesFor(voices, "es", "rioplatense")[0]?.voiceName).toBe("Diego");
  });

  it("prefers a language's home region, and a standard voice over a novelty one", () => {
    const french = [
      { voiceName: "Amélie", lang: "fr-CA", remote: false },
      { voiceName: "Grandpa (French (France))", lang: "fr-FR", remote: false },
      { voiceName: "Thomas", lang: "fr-FR", remote: false },
    ];
    expect(voicesFor(french, "fr").map((v) => v.voiceName)).toEqual(["Thomas", "Grandpa (French (France))", "Amélie"]);
  });

  it("finds nothing for a language without a voice", () => {
    expect(voicesFor(voices, "mi")).toEqual([]);
  });
});

describe("speakableLanguages", () => {
  it("lists the languages with an on-device voice, once each", () => {
    expect(speakableLanguages(voices)).toEqual(["el", "es", "fr"]);
  });
});

describe("isRecordingUrl", () => {
  it("accepts only Wikimedia's upload server over https", () => {
    expect(isRecordingUrl("https://upload.wikimedia.org/wikipedia/commons/x/xx/Fr-manger.ogg")).toBe(true);
    expect(isRecordingUrl("http://upload.wikimedia.org/x.ogg")).toBe(false);
    expect(isRecordingUrl("https://example.com/x.ogg")).toBe(false);
    expect(isRecordingUrl("not a url")).toBe(false);
  });
});
