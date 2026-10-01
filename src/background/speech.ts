import { languageByCode, normaliseLanguageTag } from "../shared/languages";
import type { SpanishVariety } from "../shared/settings";
import { isRecordingUrl, type Speech, type Spoken } from "../shared/speech";

/** The parts of `chrome.tts.TtsVoice` that matter here. */
export interface VoiceInfo {
  voiceName?: string;
  lang?: string;
  remote?: boolean;
}

// Regions whose voices to prefer, best first. Spanish follows the variety
// being learned; for other languages, the language's home country.
const SPANISH_REGIONS: Record<SpanishVariety, string[]> = {
  spain: ["es-ES"],
  "latin-america": ["es-MX", "es-US", "es-419", "es-CO"],
  rioplatense: ["es-AR", "es-UY", "es-MX", "es-US", "es-419"],
};
const HOME_REGIONS: Record<string, string[]> = {
  fr: ["fr-FR"], de: ["de-DE"], it: ["it-IT"], pt: ["pt-PT", "pt-BR"], nl: ["nl-NL"], el: ["el-GR"],
  ca: ["ca-ES"], sv: ["sv-SE"], da: ["da-DK"], nb: ["nb-NO"], fi: ["fi-FI"], pl: ["pl-PL"], cs: ["cs-CZ"],
  ro: ["ro-RO"], hu: ["hu-HU"], ru: ["ru-RU"], uk: ["uk-UA"], tr: ["tr-TR"], ja: ["ja-JP"], ko: ["ko-KR"],
  zh: ["zh-CN"], en: ["en-GB", "en-US"],
};

/**
 * On-device voices for a language, best first. Remote voices are never used:
 * they send the text to a speech service, and Paradigma keeps everything else
 * it can in the browser.
 */
export function voicesFor(voices: VoiceInfo[], lang: string, spanishVariety: SpanishVariety = "spain"): VoiceInfo[] {
  const local = voices.filter((v) => !v.remote && v.lang && normaliseLanguageTag(v.lang) === lang);
  const regions = lang === "es" ? SPANISH_REGIONS[spanishVariety] : (HOME_REGIONS[lang] ?? []);
  const regionRank = (v: VoiceInfo) => {
    const i = regions.findIndex((r) => r.toLowerCase() === v.lang?.toLowerCase());
    return i === -1 ? regions.length : i;
  };
  // macOS lists novelty voices as "Grandpa (French (France))"; its standard
  // voices have plain names ("Thomas", "Melina").
  const plainName = (v: VoiceInfo) => (v.voiceName && !v.voiceName.includes("(") ? 0 : 1);
  return [...local].sort((a, b) => regionRank(a) - regionRank(b) || plainName(a) - plainName(b));
}

/** Languages this computer can speak without sending anything anywhere. */
export function speakableLanguages(voices: VoiceInfo[]): string[] {
  const langs = voices.filter((v) => !v.remote && v.lang).map((v) => normaliseLanguageTag(v.lang)!);
  return [...new Set(langs)].sort();
}

let creatingOffscreen: Promise<void> | undefined;

/**
 * Recordings play in an offscreen extension document rather than the web
 * page, whose Content-Security-Policy may block media from Wikimedia.
 */
async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (existing.length > 0) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: "offscreen/offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Plays native speakers' pronunciation recordings from Wiktionary.",
    })
    .finally(() => (creatingOffscreen = undefined));
  await creatingOffscreen;
}

async function playRecording(url: string): Promise<void> {
  await ensureOffscreenDocument();
  const reply = (await chrome.runtime.sendMessage({ target: "offscreen", type: "play", url })) as
    | { ok: true }
    | { ok: false; error: string }
    | undefined;
  if (!reply?.ok) throw new Error(reply?.error ?? "The recording couldn't be played.");
}

function speakWithVoice(text: string, voice: VoiceInfo): Promise<void> {
  chrome.tts.stop();
  return new Promise((resolve, reject) => {
    void chrome.tts.speak(text, {
      ...(voice.voiceName ? { voiceName: voice.voiceName } : {}),
      ...(voice.lang ? { lang: voice.lang } : {}),
      rate: 0.9, // a little slower than conversation, for learners
      onEvent: (event) => {
        if (event.type === "error") reject(new Error(event.errorMessage || "The words couldn't be spoken."));
        else if (event.type === "start" || event.type === "end" || event.type === "interrupted" || event.type === "cancelled") {
          resolve();
        }
      },
    });
  });
}

/**
 * Says something aloud: a native speaker's recording if there is one, else
 * an on-device voice. Rejects with a message fit to show the user.
 */
export async function speak(speech: Speech, spanishVariety: SpanishVariety): Promise<Spoken> {
  if (speech.recording && isRecordingUrl(speech.recording)) {
    try {
      await playRecording(speech.recording);
      return "recording";
    } catch {
      // Fall back to a voice below.
    }
  }
  const voice = voicesFor(await chrome.tts.getVoices(), speech.lang, spanishVariety)[0];
  if (!voice) {
    const name = languageByCode(speech.lang)?.name ?? speech.lang;
    throw new Error(`This computer has no ${name} voice to read it aloud.`);
  }
  await speakWithVoice(speech.text, voice);
  return "voice";
}

export async function availableSpeechLanguages(): Promise<string[]> {
  return speakableLanguages(await chrome.tts.getVoices());
}
