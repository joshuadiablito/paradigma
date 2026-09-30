// MyMemory: free machine/memory translation, no key needed.
// Anonymous use is limited to roughly 5,000 characters a day per IP.
// https://mymemory.translated.net/doc/spec.php

export const MYMEMORY_MAX_BYTES = 500;

export class TranslationError extends Error {}

export async function translateWithMyMemory(
  text: string,
  from: string,
  to: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const q = truncateToBytes(text.trim(), MYMEMORY_MAX_BYTES);
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", q);
  url.searchParams.set("langpair", `${from}|${to}`);

  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new TranslationError(`MyMemory responded ${res.status}`);
  const body = (await res.json()) as {
    responseStatus?: number | string;
    responseDetails?: string;
    quotaFinished?: boolean;
    responseData?: { translatedText?: string };
  };

  const translated = body.responseData?.translatedText?.trim();
  // Quota and error messages arrive as a "successful" translation in capitals.
  if (body.quotaFinished || translated?.startsWith("MYMEMORY WARNING")) {
    throw new TranslationError("MyMemory's free daily limit has been reached");
  }
  if (Number(body.responseStatus) !== 200 || !translated) {
    throw new TranslationError(body.responseDetails || "MyMemory returned no translation");
  }
  return decodeEntities(translated);
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
