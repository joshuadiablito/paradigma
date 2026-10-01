import { describe, expect, it } from "vitest";
import { translateWithMyMemory, withMyMemoryEmail } from "./translate";

const reply = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;

describe("translateWithMyMemory", () => {
  it("sends the language pair and returns the translation", async () => {
    let seen: URL | undefined;
    const fetchFn = (async (u: URL) => {
      seen = u;
      return Response.json({ responseStatus: 200, responseData: { translatedText: "I eat" } });
    }) as unknown as typeof fetch;
    await expect(translateWithMyMemory("je mange", "fr", "en", fetchFn)).resolves.toBe("I eat");
    expect(seen?.searchParams.get("langpair")).toBe("fr|en");
    expect(seen?.searchParams.get("q")).toBe("je mange");
  });

  it("decodes HTML entities in the translation", async () => {
    const fetchFn = reply({ responseStatus: 200, responseData: { translatedText: "the man&#39;s &quot;house&quot;" } });
    await expect(translateWithMyMemory("x", "fr", "en", fetchFn)).resolves.toBe(`the man's "house"`);
  });

  it("reports the daily limit instead of showing the warning as a translation", async () => {
    const fetchFn = reply({
      responseStatus: 200,
      responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" },
    });
    await expect(translateWithMyMemory("x", "fr", "en", fetchFn)).rejects.toThrow(/daily limit/);
  });

  it("points to the email setting when the daily limit is reached", async () => {
    const fetchFn = reply({ quotaFinished: true, responseStatus: 200, responseData: { translatedText: "x" } });
    await expect(translateWithMyMemory("x", "fr", "en", fetchFn)).rejects.toThrow(/email in Lekseis Hover's settings/);
  });

  it("reports API errors", async () => {
    const fetchFn = reply({ responseStatus: "403", responseDetails: "INVALID LANGUAGE PAIR" });
    await expect(translateWithMyMemory("x", "fr", "xx", fetchFn)).rejects.toThrow("INVALID LANGUAGE PAIR");
  });

  it("truncates text to MyMemory's 500-byte limit without splitting a character", async () => {
    let q = "";
    const fetchFn = (async (u: URL) => {
      q = u.searchParams.get("q") ?? "";
      return Response.json({ responseStatus: 200, responseData: { translatedText: "ok" } });
    }) as unknown as typeof fetch;
    await translateWithMyMemory("é".repeat(400), "fr", "en", fetchFn);
    expect(new TextEncoder().encode(q).length).toBe(500);
    expect(q).toBe("é".repeat(250));
  });
});

describe("withMyMemoryEmail", () => {
  /** A fetch that records the URL of every request. */
  function recorder() {
    const urls: URL[] = [];
    const fn = (async (input: RequestInfo | URL) => {
      urls.push(new URL(input instanceof Request ? input.url : String(input)));
      return Response.json({ responseStatus: 200, responseData: { translatedText: "ok" } });
    }) as typeof fetch;
    return { fn, urls };
  }

  it("adds the email to MyMemory requests", async () => {
    const { fn, urls } = recorder();
    await translateWithMyMemory("je mange", "fr", "en", withMyMemoryEmail(fn, "ana@example.com"));
    expect(urls[0]?.searchParams.get("de")).toBe("ana@example.com");
  });

  it("keeps the request's other query parameters", async () => {
    const { fn, urls } = recorder();
    await withMyMemoryEmail(fn, "ana@example.com")("https://api.mymemory.translated.net/get?q=je%20mange&langpair=fr%7Cen");
    expect(urls[0]?.searchParams.get("q")).toBe("je mange");
    expect(urls[0]?.searchParams.get("langpair")).toBe("fr|en");
    expect(urls[0]?.searchParams.get("de")).toBe("ana@example.com");
  });

  it("adds the email to MyMemory requests given as Request objects", async () => {
    const { fn, urls } = recorder();
    await withMyMemoryEmail(fn, "ana@example.com")(new Request("https://api.mymemory.translated.net/get?q=x"));
    expect(urls[0]?.searchParams.get("de")).toBe("ana@example.com");
    expect(urls[0]?.searchParams.get("q")).toBe("x");
  });

  it("never sends the email to other hosts", async () => {
    const { fn, urls } = recorder();
    const fetchWithEmail = withMyMemoryEmail(fn, "ana@example.com");
    await fetchWithEmail("https://kaikki.org/dictionary/French/meaning/m/ma/manger.jsonl");
    await fetchWithEmail(new URL("https://upload.wikimedia.org/x.ogg"));
    expect(urls.map(String)).toEqual([
      "https://kaikki.org/dictionary/French/meaning/m/ma/manger.jsonl",
      "https://upload.wikimedia.org/x.ogg",
    ]);
  });

  it("leaves fetch unchanged when no email is set", () => {
    const { fn } = recorder();
    expect(withMyMemoryEmail(fn, "")).toBe(fn);
    expect(withMyMemoryEmail(fn, undefined)).toBe(fn);
  });
});
