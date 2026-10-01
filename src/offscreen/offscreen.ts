import { isRecordingUrl } from "../shared/speech";

// Plays pronunciation recordings for the service worker, which can't play
// audio itself. Only messages addressed here are answered.

let current: HTMLAudioElement | undefined;

chrome.runtime.onMessage.addListener((message: { target?: string; type?: string; url?: string }, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message.type !== "play") return false;
  if (!message.url || !isRecordingUrl(message.url)) {
    sendResponse({ ok: false, error: "Only Wikimedia recordings are played." });
    return false;
  }
  current?.pause();
  current = new Audio(message.url);
  current.play().then(
    () => sendResponse({ ok: true }),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // answered asynchronously
});
