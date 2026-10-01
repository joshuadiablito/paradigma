import type { LookupRequest, LookupResponse, LookupSelectionCommand } from "../shared/messages";
import { loadSettings } from "../shared/settings";
import type { LookupResult } from "../shared/types";
import { PromiseCache } from "./cache";
import { explain, translate } from "./lookup";

// Content scripts can't call kaikki.org directly: it sends no CORS headers,
// and a content script's requests are subject to the page's origin. The
// service worker has host permissions, so it does the fetching.

const cache = new PromiseCache<LookupResult>(300);
const CONTEXT_MENU_ID = "lekseis-hover-lookup";

chrome.runtime.onMessage.addListener((message: LookupRequest, _sender, sendResponse) => {
  if (message?.type !== "lookup") return false;
  void (async () => {
    try {
      const { native, learning } = await loadSettings();
      const text = message.text.trim();
      // In the user's own language: translate into the languages being learned.
      // In a language being learned: explain it, with its forms, in the user's language.
      const key = message.lang === native
        ? `translate|${native}|${learning.join(",")}|${text}`
        : `explain|${message.lang}|${native}|${text}`;
      const result = await cache.get(key, () =>
        message.lang === native
          ? translate({ text, from: native, targets: learning })
          : explain({ text, lang: message.lang, target: native }));
      sendResponse({ ok: true, result } satisfies LookupResponse);
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies LookupResponse);
    }
  })();
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
