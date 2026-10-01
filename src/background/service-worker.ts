import { loadLastLanguage } from "../shared/last-language";
import type {
  LookupResponse,
  LookupSelectionCommand,
  SpeakResponse,
  SpeechLanguagesResponse,
  TranslateLanguageResponse,
  WorkerRequest,
} from "../shared/messages";
import { loadSettings } from "../shared/settings";
import { createLookupService } from "./lookup-service";
import { availableSpeechLanguages, speak } from "./speech";

// Content scripts can't call kaikki.org directly: it sends no CORS headers,
// and a content script's requests are subject to the page's origin. The
// service worker has host permissions, so it does the fetching.

const lookups = createLookupService(fetch, chrome.storage.local);
const CONTEXT_MENU_ID = "paradigma-lookup";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

type WorkerResponse = LookupResponse | TranslateLanguageResponse | SpeakResponse | SpeechLanguagesResponse;

const HANDLED = new Set<WorkerRequest["type"]>(["lookup", "translate-language", "speak", "speech-languages"]);

async function respond(message: WorkerRequest): Promise<WorkerResponse> {
  if (message.type === "speech-languages") return availableSpeechLanguages();
  // Read for each request, so changed languages or a changed or removed
  // MyMemory email apply at once, without reloading the extension.
  const settings = await loadSettings();
  if (message.type === "speak") {
    await speak({ text: message.text, lang: message.lang, ...(message.recording ? { recording: message.recording } : {}) }, settings.spanishVariety);
    return { ok: true };
  }
  if (message.type === "translate-language") {
    const result = await lookups.translateLanguage(message.text, message.from, message.lang, settings);
    return { ok: true, result };
  }
  const result = await lookups.lookup(message.text, message.lang, settings, await loadLastLanguage());
  return { ok: true, result };
}

chrome.runtime.onMessage.addListener((message: WorkerRequest, _sender, sendResponse) => {
  if (!HANDLED.has(message?.type)) return false;
  respond(message).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: errorMessage(e) }));
  return true; // keeps the channel open for the async response
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.create({ id: CONTEXT_MENU_ID, title: "Look up “%s”", contexts: ["selection"] });
  if (reason === "install" && (await loadSettings()).learning.length === 0) {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || tab?.id === undefined) return;
  const command: LookupSelectionCommand = { type: "lookup-selection", ...(info.selectionText ? { text: info.selectionText } : {}) };
  void chrome.tabs.sendMessage(tab.id, command).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "lookup-selection" || tab?.id === undefined) return;
  await chrome.tabs.sendMessage(tab.id, { type: "lookup-selection" } satisfies LookupSelectionCommand).catch(() => {});
});
