// The language tab the user last chose, so the next translation opens on it.
// A per-browser convenience rather than a setting, so it lives in
// chrome.storage.local, and losing it only means opening on the first tab.

const KEY = "lastLanguage";

export async function loadLastLanguage(): Promise<string | undefined> {
  try {
    const value: unknown = (await chrome.storage.local.get(KEY))[KEY];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function saveLastLanguage(lang: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: lang });
  } catch {
    // Storage full or unavailable (e.g. an orphaned content script): not worth reporting.
  }
}
