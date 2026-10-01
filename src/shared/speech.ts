/** Something to say aloud: a word or phrase, in a language. */
export interface Speech {
  text: string;
  lang: string;
  /** A native speaker's recording of `text`, from Wikimedia, when Wiktionary has one. */
  recording?: string;
}

/** How something was said: a native speaker's recording, or the computer's own voice. */
export type Spoken = "recording" | "voice";

/** Recordings come only from Wikimedia, via kaikki.org; nothing else is played. */
export function isRecordingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "upload.wikimedia.org";
  } catch {
    return false;
  }
}
