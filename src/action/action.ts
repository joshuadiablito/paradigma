import { LANGUAGES, languageByCode } from "../shared/languages";
import type { StatusRequest, StatusResponse } from "../shared/messages";
import { loadSettings, saveSettings } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $<HTMLParagraphElement>("status");
const ruleEl = $<HTMLSelectElement>("site-rule");

const REASONS: Record<StatusResponse["reason"], (lang: string) => string> = {
  "site-on": (l) => `This site is set to ${l}.`,
  "site-off": () => "Off: turned off for this site.",
  "page-lang": (l) => `This page is in ${l}.`,
  detected: (l) => `This page looks like ${l}.`,
  assumed: (l) => `This page is treated as ${l}, your language.`,
  "not-learning": () => "Off: this page is neither in your language nor one you're learning.",
  "no-languages": () => "Off: choose the languages you're learning in Settings.",
};

/** What selecting text will do on this page. */
function whatSelectingDoes(lang: string, native: string, learning: string[]): string {
  const name = (code: string) => languageByCode(code)?.name ?? code;
  if (lang === native) {
    return ` Select a word or phrase to see it in ${learning.map(name).join(", ") || "the languages you're learning"}.`;
  }
  return ` Select a word to see what it means in ${name(native)}, and its other forms.`;
}

$("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = tab?.id === undefined
    ? undefined
    : await chrome.tabs.sendMessage<StatusRequest, StatusResponse>(tab.id, { type: "status" }).catch(() => undefined);

  if (!status) {
    statusEl.textContent = "Lekseis Hover can't run on this page. If you just installed it, reload the page.";
    return;
  }
  const langName = status.lang ? (languageByCode(status.lang)?.name ?? status.lang) : "";
  const settings = await loadSettings();
  statusEl.textContent = REASONS[status.reason](langName)
    + (status.lang ? whatSelectingDoes(status.lang, settings.native, settings.learning) : "");

  const current = settings.sites[status.host];
  $("host").textContent = status.host;
  const option = (value: string, text: string) => Object.assign(document.createElement("option"), { value, textContent: text });
  ruleEl.replaceChildren(
    option("auto", "Detect the language automatically"),
    option("off", "Never show lookups"),
    ...LANGUAGES.map((l) => option(`on:${l.code}`, `Always treat as ${l.name}`)),
  );
  ruleEl.value = current?.mode === "on" ? `on:${current.lang}` : (current?.mode ?? "auto");
  $("site-controls").hidden = false;

  ruleEl.addEventListener("change", async () => {
    const latest = await loadSettings();
    const { [status.host]: _old, ...sites } = latest.sites;
    const v = ruleEl.value;
    if (v === "off") sites[status.host] = { mode: "off" };
    else if (v.startsWith("on:")) sites[status.host] = { mode: "on", lang: v.slice(3) };
    await saveSettings({ ...latest, sites });
    statusEl.textContent = "Saved. The page picks up the change straight away.";
  });
}

void main();
