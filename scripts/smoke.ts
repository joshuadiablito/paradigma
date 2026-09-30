// End-to-end smoke test: loads dist/ into Chromium, serves a French page,
// hovers over words and checks the popup, against the real kaikki.org and
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

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Test</title>
<style>body{font:22px/2 Georgia,serif;max-width:40rem;margin:3rem auto}</style></head><body>
<p id="p1">Le matin, je <span id="mange">mange</span> une pomme avec du pain.</p>
<p id="p2">Les maisons du village sont très <span id="belles">belles</span> en été.</p>
<p id="p3" lang="en">This English <span id="english">sentence</span> is ignored.</p>
<p id="p4">Nous <span id="phrase">prenons le petit-déjeuner</span> ensemble.</p>
<p lang="el">Χθες <span id="egrapsa">έγραψα</span> ένα γράμμα.</p>
<p lang="es">Ellos <span id="comen">comen</span> pan todos los días.</p>
</body></html>`;

const server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } }) });
const url = `http://localhost:${server.port}/`;

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1100, height: 900 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures++;
};

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => chrome.storage.sync.set({ learning: ["fr", "el", "es"], native: "en", hoverDelayMs: 150, spanishVariety: "latin-america" }));
  // Close the settings tab that opens on first install.
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close();

  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(500);

  const popupText = () => page.locator("lekseis-hover-popup .lh-dialog");
  const hover = async (p: Page, selector: string) => {
    const box = (await p.locator(selector).boundingBox())!;
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  };

  // A verb form: meaning via the lemma, and the conjugation table with the form marked.
  await hover(page, "#mange");
  await popupText().getByText("Conjugation").waitFor({ timeout: 20_000 });
  const verb = await popupText().innerText();
  check(verb.includes("to eat"), "verb: shows the meaning of the lemma");
  check(/of\s+manger/.test(verb), "verb: says mange is a form of manger");
  check(await page.locator("lekseis-hover-popup details[open] mark").first().innerText() === "mange", "verb: marks the hovered form in the open table");
  check(verb.includes("nous") && verb.includes("mangeons"), "verb: shows the other persons");
  await page.screenshot({ path: `${out}/verb.png` });

  // The popup covers the next line, as a hover popup does; close it first.
  await page.keyboard.press("Escape");

  // An adjective form: gender and number.
  await hover(page, "#belles");
  await popupText().getByRole("columnheader", { name: "Masculine singular" }).waitFor({ timeout: 20_000 });
  const adj = await popupText().innerText();
  check(["beau", "belle", "beaux"].every((w) => adj.includes(w)), "adjective: shows masculine, feminine and plural forms");
  await page.screenshot({ path: `${out}/adjective.png` });

  // Text marked as English is not looked up.
  await page.keyboard.press("Escape");
  await hover(page, "#english");
  await page.waitForTimeout(800);
  check(!(await popupText().isVisible()), "English passage: no popup");

  // A selected phrase is translated.
  await page.evaluate(() => {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById("phrase")!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await hover(page, "#phrase");
  await popupText().locator(".lh-translation, .lh-warnings").first().waitFor({ timeout: 20_000 });
  const phrase = await popupText().innerText();
  check(phrase.includes("prenons le petit-déjeuner"), "phrase: looks up the whole selection");
  console.log(`  translation: ${await popupText().locator(".lh-translation, .lh-warnings").first().innerText()}`);
  await page.screenshot({ path: `${out}/phrase.png` });

  // Keyboard: Escape closes.
  await page.keyboard.press("Escape");
  check(!(await popupText().isVisible()), "Escape closes the popup");

  // Greek: an aorist form, its lemma, and the θα future (which a filter bug once removed).
  await page.keyboard.press("Escape");
  await hover(page, "#egrapsa");
  await popupText().getByText("Conjugation").waitFor({ timeout: 20_000 });
  const greek = await popupText().evaluate((el) => el.textContent ?? "");
  check(/simple past\s+of\s+γράφω/.test(greek), "Greek: says έγραψα is the simple past of γράφω");
  check(greek.includes("to write"), "Greek: shows the meaning");
  check(await page.locator("lekseis-hover-popup details[open] summary").first().innerText() === "Active simple past (aorist)", "Greek: opens the aorist table");
  check(greek.includes("θα γράψω"), "Greek: includes the θα future");
  await page.screenshot({ path: `${out}/greek.png` });

  // Latin American Spanish: ustedes, not vosotros.
  await page.keyboard.press("Escape");
  await hover(page, "#comen");
  await popupText().getByText("Conjugation").waitFor({ timeout: 20_000 });
  const spanish = await popupText().evaluate((el) => el.textContent ?? "");
  check(spanish.includes("ustedes") && !spanish.includes("vosotros") && !spanish.includes("coméis"), "Spanish (Latin America): ustedes replaces vosotros");
  await page.screenshot({ path: `${out}/spanish.png` });

  // Options page renders.
  const extId = new URL(worker.url()).host;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/options/options.html`);
  check(await options.getByLabel("French").isChecked(), "options: French is ticked");
  check(await options.getByLabel(/Latin America/).isChecked(), "options: Latin American Spanish is chosen");
  await options.screenshot({ path: `${out}/options.png`, fullPage: true });
} finally {
  await context.close();
  await server.stop(true);
}

console.log(failures === 0 ? "\nSmoke test passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
