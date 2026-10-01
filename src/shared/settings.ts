import { languageByCode } from "./languages";

export const SPANISH_VARIETIES = ["spain", "latin-america", "rioplatense"] as const;
export type SpanishVariety = (typeof SPANISH_VARIETIES)[number];

export type SiteRule = { mode: "on"; lang: string } | { mode: "off" };

export interface Settings {
  /** Languages the user is learning. */
  learning: string[];
  /**
   * The user's own language. Text selected in it is translated into the
   * learning languages; text in a learning language is explained in it.
   */
  native: string;
  /** "select": look up whatever is selected. "alt": only selections made while holding Alt/Option. */
  trigger: "select" | "alt";
  /** Which second-person forms Spanish conjugation tables show. */
  spanishVariety: SpanishVariety;
  /** Per-hostname overrides of automatic language detection. */
  sites: Record<string, SiteRule>;
}

export const DEFAULT_SETTINGS: Settings = {
  learning: [],
  native: "en",
  trigger: "select",
  spanishVariety: "spain",
  sites: {},
};

const isKnown = (code: unknown): code is string =>
  typeof code === "string" && languageByCode(code) !== undefined;

/** Turns whatever is in storage (possibly stale or hand-edited) into valid Settings. */
export function sanitiseSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const learning = Array.isArray(r.learning) ? [...new Set(r.learning.filter(isKnown))] : [];
  const native = isKnown(r.native) ? r.native : DEFAULT_SETTINGS.native;
  const trigger = r.trigger === "alt" ? "alt" : "select";

  const spanishVariety = SPANISH_VARIETIES.find((v) => v === r.spanishVariety) ?? DEFAULT_SETTINGS.spanishVariety;

  const sites: Record<string, SiteRule> = {};
  if (typeof r.sites === "object" && r.sites !== null) {
    for (const [host, rule] of Object.entries(r.sites as Record<string, unknown>)) {
      const rr = rule as Record<string, unknown> | null;
      if (rr?.mode === "off") sites[host] = { mode: "off" };
      else if (rr?.mode === "on" && isKnown(rr.lang)) sites[host] = { mode: "on", lang: rr.lang };
    }
  }

  return { learning, native, trigger, spanishVariety, sites };
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
