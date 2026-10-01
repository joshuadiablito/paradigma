import type { ContentMessage, LookupRequest, LookupResponse, StatusResponse } from "../shared/messages";
import { loadSettings, onSettingsChanged, type Settings } from "../shared/settings";
import { resolvePageLanguage, resolveTextLanguage, type PageLanguage } from "./activation";
import { LookupPopup } from "./popup-ui";
import { currentSelection, type Selected } from "./selection";

const DETECTION_SAMPLE_CHARS = 8000;

let settings: Settings;
let page: PageLanguage = { lang: null, reason: "no-languages" };
let detected: string | null | undefined; // undefined: not yet detected
const popup = new LookupPopup();
let requestId = 0;

const host = location.hostname;
const htmlLang = () => document.documentElement.getAttribute("lang");

async function detectPageLanguage(): Promise<string | null> {
  const sample = (document.body?.innerText ?? "").slice(0, DETECTION_SAMPLE_CHARS);
  if (sample.trim().length < 20) return null;
  const { isReliable, languages } = await chrome.i18n.detectLanguage(sample);
  const top = languages[0];
  return isReliable && top ? top.language : null;
}

async function refreshPageLanguage(): Promise<void> {
  page = resolvePageLanguage({ host, htmlLang: htmlLang(), detected: null, settings });
  // Detection costs a layout; only run it when the declared language didn't settle it.
  if (page.reason !== "not-learning" && page.reason !== "assumed") return;
  detected ??= await detectPageLanguage().catch(() => null);
  page = resolvePageLanguage({ host, htmlLang: htmlLang(), detected, settings });
}

function languageOf(element: Element): string | null {
  const marked = element.closest("[lang]");
  const elementLang = marked && marked !== document.documentElement ? marked.getAttribute("lang") : null;
  return resolveTextLanguage({ page, elementLang, htmlLang: htmlLang(), settings });
}

async function lookUp(selected: Selected, lang: string, opts: { focus: boolean }): Promise<void> {
  const id = ++requestId;
  popup.showLoading(selected.text, lang, selected.rect, opts);
  let response: LookupResponse;
  try {
    response = await chrome.runtime.sendMessage<LookupRequest, LookupResponse>({ type: "lookup", text: selected.text, lang });
  } catch {
    // The extension was reloaded or updated; this old content script is orphaned.
    response = { ok: false, error: "Lekseis Hover was updated. Reload the page to keep using it." };
  }
  if (id !== requestId || !popup.isOpen) return; // a newer lookup has replaced this one
  if (response.ok) popup.showResult(response.result, { spanishVariety: settings.spanishVariety });
  else popup.showError(response.error);
}

/** A selection made with the mouse (a double-clicked word, or a dragged phrase) opens a lookup. */
function onMouseUp(e: MouseEvent): void {
  if (e.button !== 0 || popup.contains(e.target)) return;
  if (settings.trigger === "alt" && !e.altKey) return;
  // The selection is final only after the mouseup's default action has run.
  setTimeout(() => {
    const selected = currentSelection(document);
    if (!selected) return;
    const lang = languageOf(selected.element);
    if (!lang || (popup.isOpen && popup.query === selected.text)) return;
    void lookUp(selected, lang, { focus: false });
  }, 0);
}

/** Keyboard shortcut or context menu: look up the selection and move focus into the popup. */
function lookUpSelection(contextMenuText?: string): void {
  const selected = currentSelection(document);
  const text = (contextMenuText ?? selected?.text ?? "").trim();
  if (!text) return;
  const element = selected?.element ?? document.body;
  // The shortcut is an explicit request, so fall back to the page's language.
  const lang = languageOf(element) ?? page.lang ?? settings.native;
  const rect = selected?.rect ?? new DOMRect(16, 16, 0, 0);
  popup.pinned = false;
  void lookUp({ text, rect, element }, lang, { focus: true });
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === "lookup-selection") lookUpSelection(message.text);
  if (message.type === "status") {
    sendResponse({ host, lang: page.lang, reason: page.reason } satisfies StatusResponse);
  }
  return false;
});

async function main(): Promise<void> {
  settings = await loadSettings();
  await refreshPageLanguage();
  onSettingsChanged((next) => {
    settings = next;
    void refreshPageLanguage();
  });

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popup.isOpen) popup.hide();
  }, true);
  document.addEventListener("pointerdown", (e) => {
    if (popup.isOpen && !popup.contains(e.target)) popup.hide();
  }, true);
  // The popup is fixed-position; once the page scrolls it no longer points at its text.
  window.addEventListener("scroll", () => {
    if (!popup.pinned) popup.hide();
  }, { passive: true });
}

void main();
