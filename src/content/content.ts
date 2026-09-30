import type { ContentMessage, LookupRequest, LookupResponse, StatusResponse } from "../shared/messages";
import { loadSettings, onSettingsChanged, type Settings } from "../shared/settings";
import { resolvePageLanguage, resolveTextLanguage, type PageLanguage } from "./activation";
import { selectionUnderPoint, wordUnderPoint, type Hit } from "./hover";
import { LookupPopup } from "./popup-ui";

const DETECTION_SAMPLE_CHARS = 8000;

let settings: Settings;
let page: PageLanguage = { lang: null, reason: "no-languages" };
let detected: string | null | undefined; // undefined: not yet detected
const popup = new LookupPopup();
let requestId = 0;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let pointer: { x: number; y: number } | null = null;

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
  if (page.reason !== "not-learning") return;
  detected ??= await detectPageLanguage().catch(() => null);
  page = resolvePageLanguage({ host, htmlLang: htmlLang(), detected, settings });
}

function languageOf(element: Element): string | null {
  const marked = element.closest("[lang]");
  const elementLang = marked && marked !== document.documentElement ? marked.getAttribute("lang") : null;
  return resolveTextLanguage({ page, elementLang, htmlLang: htmlLang(), settings });
}

/** Nothing on this page can activate: skip the per-mousemove work entirely. */
function isDormant(): boolean {
  return page.reason === "site-off" || (settings.learning.length === 0 && page.reason !== "site-on");
}

async function lookUp(hit: Hit, lang: string, opts: { focus: boolean }): Promise<void> {
  const id = ++requestId;
  popup.showLoading(hit.text, lang, hit.rect, opts);
  let response: LookupResponse;
  try {
    response = await chrome.runtime.sendMessage<LookupRequest, LookupResponse>({ type: "lookup", text: hit.text, lang });
  } catch {
    // The extension was reloaded or updated; this old content script is orphaned.
    response = { ok: false, error: "Lekseis Hover was updated. Reload the page to keep using it." };
  }
  if (id !== requestId || !popup.isOpen) return; // a newer lookup has replaced this one
  if (response.ok) popup.showResult(response.result, { spanishVariety: settings.spanishVariety });
  else popup.showError(response.error);
}

function hitAt(x: number, y: number): (Hit & { lang: string }) | null {
  const selected = selectionUnderPoint(document, x, y);
  if (selected) {
    const lang = languageOf(selected.element);
    return lang ? { ...selected, lang } : null;
  }
  return wordUnderPoint(document, x, y, languageOf);
}

function onHoverSettled(x: number, y: number): void {
  if (popup.pinned) return;
  const hit = hitAt(x, y);
  if (!hit) {
    popup.hide();
    return;
  }
  if (popup.isOpen && popup.query === hit.text) return;
  void lookUp(hit, hit.lang, { focus: false });
}

function onPointerMove(e: PointerEvent): void {
  if (e.pointerType !== "mouse" || isDormant()) return;
  pointer = { x: e.clientX, y: e.clientY };
  clearTimeout(hoverTimer);
  if (popup.contains(e.target)) return; // reading the popup
  if (settings.trigger === "alt" && !e.altKey) return;
  const { x, y } = pointer;
  hoverTimer = setTimeout(() => onHoverSettled(x, y), settings.hoverDelayMs);
}

function onKeyDown(e: KeyboardEvent): void {
  // In Alt mode, pressing Alt over a word looks it up without moving the mouse.
  if (e.key === "Alt" && settings.trigger === "alt" && pointer && !isDormant() && !e.repeat) {
    onHoverSettled(pointer.x, pointer.y);
  }
  if (e.key === "Escape" && popup.isOpen) popup.hide();
}

/** Keyboard shortcut or context menu: look up the selection and move focus into the popup. */
function lookUpSelection(contextMenuText?: string): void {
  const sel = document.getSelection();
  const text = (contextMenuText ?? sel?.toString() ?? "").trim();
  if (!text) return;
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const container = range?.commonAncestorContainer;
  const element = (container instanceof Element ? container : container?.parentElement) ?? document.body;
  // The shortcut is an explicit request, so fall back to the first learning language.
  const lang = languageOf(element) ?? page.lang ?? settings.learning[0];
  if (!lang) return;
  const rect = range?.getBoundingClientRect() ?? new DOMRect(16, 16, 0, 0);
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

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", (e) => {
    if (popup.isOpen && !popup.contains(e.target)) popup.hide();
  }, true);
  // The popup is fixed-position; once the page scrolls it no longer points at its word.
  window.addEventListener("scroll", () => {
    if (!popup.pinned) popup.hide();
  }, { passive: true });
}

void main();
