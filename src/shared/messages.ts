import type { LanguageOutcome, LookupResult } from "./types";

/** Content script → service worker. */
export interface LookupRequest {
  type: "lookup";
  text: string;
  lang: string;
}

export type LookupResponse = { ok: true; result: LookupResult } | { ok: false; error: string };

/**
 * Content script → service worker, when a language's tab is first shown:
 * translate the text of an earlier "lookup" into that language.
 */
export interface TranslateLanguageRequest {
  type: "translate-language";
  text: string;
  /** Language of the text: the user's own, as in the lookup's result. */
  from: string;
  /** The language to translate into. */
  lang: string;
}

export type TranslateLanguageResponse = LanguageOutcome;

export type WorkerRequest = LookupRequest | TranslateLanguageRequest;

/** Service worker → content script, when the keyboard shortcut or context menu fires. */
export interface LookupSelectionCommand {
  type: "lookup-selection";
  /** Present when triggered from the context menu, which knows the selected text. */
  text?: string;
}

/** Toolbar popup → content script. */
export interface StatusRequest {
  type: "status";
}

export type ActivationReason =
  | "site-on"
  | "site-off"
  | "page-lang"
  | "detected"
  | "assumed"
  | "not-learning"
  | "no-languages";

export interface StatusResponse {
  host: string;
  lang: string | null;
  reason: ActivationReason;
}

export type ContentMessage = LookupSelectionCommand | StatusRequest;
