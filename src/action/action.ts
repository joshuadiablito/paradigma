import { LANGUAGES, languageByCode } from "../shared/languages";
import type { StatusRequest, StatusResponse } from "../shared/messages";
import { loadSettings, saveSettings } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $<HTMLParagraphElement>("status");
const ruleEl = $<HTMLSelectElement>("site-rule");

const REASONS: Record<StatusResponse["reason"], (lang: string) => string> = {
  "site-on": (l) => `On: this site is set to ${l}.`,
  "site-off": () => "Off: turned off for this site.",
  "page-lang": (l) => `On: this page is in ${l}.`,
  detected: (l) => `On: this page looks like ${l}.`,
  "not-learning": () => "Off: this page isn't in a language you're learning.",
  "no-languages": () => "Off: choose the languages you're learning in Settings.",
};

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
  statusEl.textContent = REASONS[status.reason](langName);

  const settings = await loadSettings();
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
