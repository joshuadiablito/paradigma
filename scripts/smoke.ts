// End-to-end smoke test: loads dist/ into Chromium, serves an English page
// with French, Greek and Spanish passages, selects words and phrases the way a
// person would, and checks the popup, against the real kaikki.org and
// MyMemory APIs. Screenshots go to smoke-output/.
//
//   bun run build && bun run smoke

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const out = resolve(root, "smoke-output");
mkdirSync(out, { recursive: true });

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test</title>
<style>body{font:22px/2 Georgia,serif;max-width:40rem;margin:3rem auto}</style></head><body>
<p>Every morning we <span id="eat">eat</span> breakfast in the old <span id="house">house</span>.</p>
<p>Yesterday they <span id="ate">ate</span> outside, <span id="phrase">because the weather was lovely</span>.</p>
<p lang="fr">Le matin, je <span id="mange">mange</span> une pomme. Les maisons sont <span id="belles">belles</span>.</p>
<p lang="el">Χθες <span id="egrapsa">έγραψα</span> ένα γράμμα.</p>
<p lang="es">Ellos <span id="comen">comen</span> pan todos los días.</p>
<p lang="de">Dieser Satz ist auf <span id="german">Deutsch</span>.</p>
</body></html>`;

const server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } }) });
const url = `http://localhost:${server.port}/`;

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 800 }, // the Web Store's screenshot size
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures++;
};

try {
  let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extId = new URL(worker.url()).host;
  await worker.evaluate(() =>
    chrome.storage.sync.set({ learning: ["fr", "el", "es"], native: "en", spanishVariety: "latin-america" }));
  // Close the settings tab that opens on first install.
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close();

  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(500);

  const popup = () => page.locator("lekseis-hover-popup .lh-dialog");
  const popupText = () => popup().evaluate((el) => el.textContent ?? "");
  const close = () => page.keyboard.press("Escape");
  const doubleClick = (p: Page, selector: string) => p.locator(selector).dblclick();
  const drag = async (p: Page, selector: string) => {
    const box = (await p.locator(selector).boundingBox())!;
    await p.mouse.move(box.x + 1, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
    await p.mouse.up();
  };

  // Hovering alone does nothing: a lookup needs a selection.
  const eatBox = (await page.locator("#eat").boundingBox())!;
  await page.mouse.move(eatBox.x + 5, eatBox.y + 5);
  await page.waitForTimeout(800);
  check(!(await popup().isVisible()), "hovering without selecting shows nothing");

  // English word → a tab per learning language, with dictionary translations and forms.
  await doubleClick(page, "#eat");
  await popup().locator("[role=tab]").first().waitFor({ timeout: 20_000 });
  await popup().getByText("Conjugation").first().waitFor({ timeout: 20_000 });
  const tabs = await popup().locator("[role=tab]").allInnerTexts();
  check(tabs.join(",") === "French,Greek,Spanish", `English word: a tab per language (${tabs.join(", ")})`);
  const eat = await popupText();
  check(eat.includes("manger") && eat.includes("mangeons"), "English word: French translation with its conjugation");
  await page.screenshot({ path: `${out}/translate-french.png` });
  const visiblePanel = () => popup().locator("[role=tabpanel]:not([hidden])");
  check(await visiblePanel().locator("a.lh-wikt").getAttribute("href") === "https://en.wiktionary.org/wiki/manger#French",
    "English word: French tab links to manger's Wiktionary entry");

  // Later tabs are translated only when chosen: nothing is fetched for them up front.
  const greekPanel = popup().locator("[role=tabpanel]").nth(1);
  check(await greekPanel.evaluate((el) => el.textContent ?? "") === "", "English word: the Greek tab isn't loaded before it's chosen");
  await popup().locator("[role=tab]", { hasText: "Greek" }).click();
  await visiblePanel().locator("details.lh-table[open]").first().waitFor({ timeout: 20_000 });
  const greekOpen = await visiblePanel().locator("details.lh-table[open]").first().evaluate((el) => el.textContent ?? "");
  check(greekOpen.startsWith("Active present") && greekOpen.includes("τρώμε"), "English word: Greek tab opens τρώω's present tense");
  await page.screenshot({ path: `${out}/translate-greek.png` });

  await popup().locator("[role=tab]", { hasText: "Spanish" }).click();
  await visiblePanel().locator("details.lh-table[open]").first().waitFor({ timeout: 20_000 });
  const spanishOpen = await visiblePanel().locator("details.lh-table[open]").first().evaluate((el) => el.textContent ?? "");
  check(spanishOpen.startsWith("Indicative present") && ["nosotros", "comemos", "ustedes", "comen", "ellos/ellas"].every((w) => spanishOpen.includes(w)),
    "English word: Spanish tab opens the present with every plural person");
  await visiblePanel().locator("details.lh-table[open]").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/translate-spanish.png` });
  await popup().locator("[role=tab]", { hasText: "French" }).click();
  check((await visiblePanel().innerText()).includes("mangeons"), "English word: going back to French still shows its conjugation");
  await popup().locator("[role=tab]", { hasText: "Spanish" }).click();
  await close();

  // Saved lookups: what was fetched is kept in chrome.storage.local, and a
  // restarted service worker (its memory gone) serves it from there.
  const extPage = await context.newPage();
  await extPage.goto(`chrome-extension://${extId}/options/options.html`);
  type Stored = Record<string, { savedAt?: number; items?: Record<string, { savedAt: number; usedAt: number }> }>;
  const stored = () => extPage.evaluate(() => chrome.storage.local.get(null)) as Promise<Stored>;
  const sourceKey = "lookup:1:source:en|fr,el,es|eat";
  const spanishKey = "lookup:1:language:en|fr,el,es|eat|es";
  const before = await stored();
  check(Boolean(before["lookup:index"]) && ["fr", "el", "es"].every((l) => before[`lookup:1:language:en|fr,el,es|eat|${l}`]) && Boolean(before[sourceKey]),
    `saved lookups: 'eat' and each language's translation are saved (${Object.keys(before).filter((k) => k.startsWith("lookup:")).length} keys)`);

  await worker.evaluate(() => { (self as unknown as { smokeMarker: boolean }).smokeMarker = true; });
  // An extension page's DevTools session can stop the extension's service worker.
  const cdp = await context.newCDPSession(extPage);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await page.waitForTimeout(1000);
  await doubleClick(page, "#eat");
  await popup().getByText("Conjugation").first().waitFor({ timeout: 20_000 });
  check((await popupText()).includes("comemos"), "saved lookups: 'eat' looked up again after the service worker was stopped");
  await close();
  const restarted = [];
  for (const w of context.serviceWorkers()) {
    const fresh = await Promise.race([
      w.evaluate(() => (self as unknown as { smokeMarker?: boolean }).smokeMarker === undefined),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]).catch(() => null);
    if (fresh === true) restarted.push(w);
  }
  check(restarted.length === 1, "saved lookups: the service worker really was restarted, losing its memory");
  if (restarted[0]) worker = restarted[0];
  const after = await stored();
  const index = after["lookup:index"]?.items ?? {};
  check(after[sourceKey]?.savedAt === before[sourceKey]?.savedAt && after[spanishKey]?.savedAt === before[spanishKey]?.savedAt,
    "saved lookups: the restarted worker didn't refetch 'eat' (its saved entries are unchanged)");
  check((index[spanishKey]?.usedAt ?? 0) > (before["lookup:index"]?.items?.[spanishKey]?.usedAt ?? Infinity),
    "saved lookups: the restarted worker read the Spanish translation from storage");
  await extPage.close();

  // An inflected English word is traced to its lemma, opening on the tab last chosen.
  await doubleClick(page, "#ate");
  await popup().locator("[role=tab]").first().waitFor({ timeout: 20_000 });
  check(/simple past\s+of\s+eat/.test(await popupText()), "English inflection: 'ate' is the simple past of eat");
  check(await popup().locator("[role=tab][aria-selected=true]").innerText() === "Spanish", "English inflection: opens on Spanish, the tab last chosen");
  await popup().locator("[role=tab]", { hasText: "French" }).click();
  await close();

  // A noun shows gender.
  await doubleClick(page, "#house");
  await popup().locator("abbr.lh-gender").first().waitFor({ timeout: 20_000 });
  check((await popupText()).includes("maison"), "English noun: French maison, with gender");
  await close();

  // An English phrase → machine translation per language.
  await drag(page, "#phrase");
  await popup().locator(".lh-translation").first().waitFor({ timeout: 20_000 });
  const phrase = await popup().locator("[role=tabpanel]:not([hidden]) .lh-translation").innerText();
  check(phrase.startsWith("Machine translation:"), `English phrase: machine translated (${phrase})`);
  const phraseFooter = await popup().locator("footer").innerText();
  check(await popup().locator("a").count() === 0 && !phraseFooter.includes("Wiktionary"),
    `English phrase: no Wiktionary link or credit (footer: ${phraseFooter})`);
  await page.screenshot({ path: `${out}/phrase.png` });
  await close();

  // A word in a learning language → its meaning in English and its other forms.
  await doubleClick(page, "#mange");
  await popup().getByText("Conjugation").waitFor({ timeout: 20_000 });
  const mange = await popupText();
  check(/of\s+manger/.test(mange) && mange.includes("to eat"), "French word: form of manger, meaning 'to eat'");
  check(await page.locator("lekseis-hover-popup details[open] mark").first().innerText() === "mange", "French word: marks the selected form");
  await page.screenshot({ path: `${out}/explain-french.png` });
  await close();

  await doubleClick(page, "#belles");
  await popup().getByRole("columnheader", { name: "Masculine singular" }).waitFor({ timeout: 20_000 });
  const belles = await popupText();
  check(["beau", "belle", "beaux"].every((w) => belles.includes(w)), "French adjective: gender and number table");
  await close();

  await doubleClick(page, "#egrapsa");
  await popup().getByText("Conjugation").waitFor({ timeout: 20_000 });
  const greek = await popupText();
  check(/simple past\s+of\s+γράφω/.test(greek) && greek.includes("θα γράψω"), "Greek word: aorist of γράφω, with futures");
  await page.screenshot({ path: `${out}/explain-greek.png` });
  await close();

  // A language that's neither English nor being learned is ignored.
  await doubleClick(page, "#german");
  await page.waitForTimeout(800);
  check(!(await popup().isVisible()), "German passage (not being learned): no popup");

  // Keyboard: Escape closes.
  await doubleClick(page, "#comen");
  await popup().getByText("Conjugation").waitFor({ timeout: 20_000 });
  await close();
  check(!(await popup().isVisible()), "Escape closes the popup");

  // Options page renders.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options/options.html`);
  check(await options.getByLabel("French").isChecked(), "options: French is ticked");
  check(await options.getByLabel(/Latin America/).isChecked(), "options: Latin American Spanish is chosen");
  check(await options.getByLabel("Whenever I select text").isChecked(), "options: lookups on selection");
  await options.screenshot({ path: `${out}/options.png`, fullPage: true });

  // The optional MyMemory email: labelled, invalid addresses rejected, valid ones saved.
  const storedEmail = () => worker.evaluate(async () => (await chrome.storage.sync.get("myMemoryEmail")).myMemoryEmail);
  const email = options.getByRole("textbox", { name: "Email address (optional)" });
  check(await email.count() === 1, "options: the email field has an accessible label");
  check(
    (await email.getAttribute("aria-describedby")) === "email-hint" && (await options.locator("#email-hint").innerText()).includes("50,000"),
    "options: the email field is described by its hint",
  );
  await email.fill("not an email");
  await email.press("Tab");
  check(await email.getAttribute("aria-invalid") === "true", "options: an invalid email is marked invalid");
  check((await options.locator("#saved").innerText()).startsWith("Not saved"), "options: an invalid email is announced as not saved");
  check(!(await storedEmail()), "options: an invalid email is not stored");
  await email.fill("learner@example.com");
  await email.press("Tab");
  await options.locator("#saved", { hasText: "Saved" }).waitFor();
  check(await storedEmail() === "learner@example.com", "options: a valid email is stored");
  check(await email.getAttribute("aria-invalid") === null, "options: a valid email clears the error");
  await email.fill("");
  await email.press("Tab");
  await options.locator("#saved", { hasText: "removed" }).waitFor();
  check(await storedEmail() === "", "options: clearing the email stores nothing");

  // Saved lookups: a rough size, and a button that clears them and nothing else.
  await options.reload();
  const size = options.locator("#saved-lookups-size");
  await size.filter({ hasText: /^(About|Nothing)/ }).waitFor();
  const sizeText = await size.innerText();
  check(/^About \d+(\.\d)? (KB|MB) in \d+ saved results?\.$/.test(sizeText), `options: shows how much is saved (${sizeText})`);
  const clear = options.getByRole("button", { name: "Clear saved lookups" });
  check((await clear.boundingBox())!.height >= 44, "options: the clear button is at least 44px tall");
  await clear.click();
  await options.locator("#saved", { hasText: "Cleared saved lookups." }).waitFor();
  check(await size.innerText() === "Nothing saved at the moment.", "options: clearing announces it and empties the saved lookups");
  const local = await options.evaluate(() => chrome.storage.local.get(null));
  check(Object.keys(local).every((k) => !k.startsWith("lookup:")) && local.lastLanguage !== undefined,
    "options: clearing leaves no saved lookups, but keeps the remembered tab");
  const sync = await options.evaluate(() => chrome.storage.sync.get("learning"));
  check(JSON.stringify(sync.learning) === JSON.stringify(["fr", "el", "es"]), "options: clearing saved lookups keeps the settings");
} finally {
  await context.close();
  await server.stop(true);
}

console.log(failures === 0 ? "\nSmoke test passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
