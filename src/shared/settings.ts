import { languageByCode } from "./languages";

export const SPANISH_VARIETIES = ["spain", "latin-america", "rioplatense"] as const;
export type SpanishVariety = (typeof SPANISH_VARIETIES)[number];

export type SiteRule = { mode: "on"; lang: string } | { mode: "off" };

export interface Settings {
  /** Languages the user is learning; pages in these languages get hover lookups. */
  learning: string[];
  /** Language translations are shown in. */
  native: string;
  /** "hover": look up whatever the pointer rests on. "alt": only while Alt/Option is held. */
  trigger: "hover" | "alt";
  hoverDelayMs: number;
  /** Which second-person forms Spanish conjugation tables show. */
  spanishVariety: SpanishVariety;
  /** Per-hostname overrides of automatic language detection. */
  sites: Record<string, SiteRule>;
  /**
   * Optional. Sent to MyMemory with each translation request, which raises the
   * free daily limit from about 5,000 to 50,000 characters. "" when not given.
   */
  myMemoryEmail: string;
}

export const DEFAULT_SETTINGS: Settings = {
  learning: [],
  native: "en",
  trigger: "hover",
  hoverDelayMs: 400,
  spanishVariety: "spain",
  sites: {},
  myMemoryEmail: "",
};

export const HOVER_DELAY_RANGE = { min: 100, max: 2000 } as const;

// Deliberately loose: one "@", something before it, and a dot in the domain.
// It only has to catch typos and junk; MyMemory decides what it accepts.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The trimmed address if it looks like one, otherwise "". */
export function plausibleEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email) ? email : "";
}

const isKnown = (code: unknown): code is string =>
  typeof code === "string" && languageByCode(code) !== undefined;

/** Turns whatever is in storage (possibly stale or hand-edited) into valid Settings. */
export function sanitiseSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const learning = Array.isArray(r.learning) ? [...new Set(r.learning.filter(isKnown))] : [];
  const native = isKnown(r.native) ? r.native : DEFAULT_SETTINGS.native;
  const trigger = r.trigger === "alt" ? "alt" : "hover";
  const delay = typeof r.hoverDelayMs === "number" && Number.isFinite(r.hoverDelayMs)
    ? Math.round(r.hoverDelayMs)
    : DEFAULT_SETTINGS.hoverDelayMs;
  const hoverDelayMs = Math.min(HOVER_DELAY_RANGE.max, Math.max(HOVER_DELAY_RANGE.min, delay));

  const spanishVariety = SPANISH_VARIETIES.find((v) => v === r.spanishVariety) ?? DEFAULT_SETTINGS.spanishVariety;

  const sites: Record<string, SiteRule> = {};
  if (typeof r.sites === "object" && r.sites !== null) {
    for (const [host, rule] of Object.entries(r.sites as Record<string, unknown>)) {
      const rr = rule as Record<string, unknown> | null;
      if (rr?.mode === "off") sites[host] = { mode: "off" };
      else if (rr?.mode === "on" && isKnown(rr.lang)) sites[host] = { mode: "on", lang: rr.lang };
    }
  }

  const myMemoryEmail = plausibleEmail(r.myMemoryEmail);

  return { learning, native, trigger, hoverDelayMs, spanishVariety, sites, myMemoryEmail };
}

export async function loadSettings(): Promise<Settings> {
  return sanitiseSettings(await chrome.storage.sync.get(null));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set(sanitiseSettings(settings));
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync") void loadSettings().then(callback);
  });
}
