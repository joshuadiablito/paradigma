import { describe, expect, it } from "vitest";
import { translateWithMyMemory } from "./translate";

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
