// MyMemory: free machine/memory translation, no key needed.
// Anonymous use is limited to roughly 5,000 characters a day per IP; giving an
// email address in the `de` parameter raises that to 50,000.
// https://mymemory.translated.net/doc/spec.php
// https://mymemory.translated.net/doc/usagelimits.php

export const MYMEMORY_MAX_BYTES = 500;
export const MYMEMORY_HOST = "api.mymemory.translated.net";

export class TranslationError extends Error {}

interface MyMemoryBody {
  responseStatus?: number | string;
  responseDetails?: string;
  quotaFinished?: boolean;
  responseData?: { translatedText?: string };
  matches?: { translation?: unknown }[];
}

/**
 * What's wrong with a MyMemory reply that arrived with HTTP 200, if anything:
 * the daily limit, an error, or no translation at all.
 */
export function myMemoryProblem(reply: unknown): TranslationError | undefined {
  const body = (typeof reply === "object" && reply !== null ? reply : {}) as MyMemoryBody;
  const translated = typeof body.responseData?.translatedText === "string" ? body.responseData.translatedText.trim() : "";
  // Quota and error messages arrive as a "successful" translation in capitals.
  if (body.quotaFinished || translated.startsWith("MYMEMORY WARNING")) {
    return new TranslationError(
      "MyMemory's free daily limit has been reached. Adding your email in the Paradigma settings raises it.",
    );
  }
  if (Number(body.responseStatus) !== 200 || !translated) {
    return new TranslationError(body.responseDetails || "MyMemory returned no translation");
  }
  return undefined;
}

export interface MachineTranslation {
  text: string;
  /**
   * Other renderings MyMemory knows of (its translation memory "matches"),
   * best first, excluding `text`. Useful when `text` is an inflected form or a
   * phrase the dictionary has no entry for.
   */
  alternatives: string[];
}

export async function translateWithMyMemory(
  text: string,
  from: string,
  to: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  return (await machineTranslate(text, from, to, fetchFn)).text;
}

export async function machineTranslate(
  text: string,
  from: string,
  to: string,
  fetchFn: typeof fetch = fetch,
): Promise<MachineTranslation> {
  const q = truncateToBytes(text.trim(), MYMEMORY_MAX_BYTES);
  const url = new URL(`https://${MYMEMORY_HOST}/get`);
  url.searchParams.set("q", q);
  url.searchParams.set("langpair", `${from}|${to}`);

  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new TranslationError(`MyMemory responded ${res.status}`);
  const body = (await res.json()) as MyMemoryBody;
  const problem = myMemoryProblem(body);
  if (problem) throw problem;

  const main = decodeEntities(body.responseData!.translatedText!.trim());
  const alternatives = [...new Set(
    (body.matches ?? [])
      .map((m) => (typeof m.translation === "string" ? decodeEntities(m.translation.trim()) : ""))
      .filter((t) => t && t.toLocaleLowerCase() !== main.toLocaleLowerCase()),
  )];
  return { text: main, alternatives };
}

/**
 * Wraps fetch so requests to MyMemory carry the user's email address, which
 * raises their free daily limit. Other hosts never see the address.
 */
export function withMyMemoryEmail(fetchFn: typeof fetch, email: string | undefined): typeof fetch {
  if (!email) return fetchFn;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    const url = new URL(isRequest ? input.url : String(input));
    if (url.hostname !== MYMEMORY_HOST) return fetchFn(input, init);
    url.searchParams.set("de", email);
    return fetchFn(isRequest ? new Request(url, input) : url, init);
  }) as typeof fetch;
}

function truncateToBytes(text: string, max: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (encoder.encode(out + ch).length > max) break;
    out += ch;
  }
  return out;
}

// MyMemory sometimes returns HTML-escaped text ("l&#39;homme"). The result is
// rendered as text, never HTML, so decoding here is safe.
function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[lower] ?? m;
  });
}
