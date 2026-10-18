// Chrome Web Store listing images: five 1280×800 screenshots of the real
// extension on demo pages, a 440×280 small promo tile and a 1400×560 marquee.
// Lookups use the real kaikki.org and MyMemory APIs. Images go to listing-output/.
//
//   bun run build && bun run listing

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Locator } from "playwright";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const out = resolve(root, "listing-output");
mkdirSync(out, { recursive: true });

const ICON = `data:image/svg+xml;base64,${Buffer.from(readFileSync(resolve(root, "assets/icon.svg"))).toString("base64")}`;
const BLUE = "#1d4ed8";
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

// ── Demo pages: fictional sites, with text written for these images ─────────

const site = (lang: string, title: string, masthead: string, accent: string, body: string) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><style>
  body { margin: 0; font: 21px/1.75 Georgia, "Times New Roman", serif; color: #222; background: #fbfaf7; }
  header { padding: 12px 56px; border-bottom: 3px solid ${accent}; background: #fff; font: 700 22px ${FONT}; color: ${accent}; letter-spacing: .02em; }
  main { max-width: 640px; padding: 18px 56px; }
  h1 { font-size: 32px; line-height: 1.2; margin: 0 0 4px; }
  .byline { font: 14px ${FONT}; color: #777; margin-bottom: 8px; }
  p { margin: 0 0 16px; }
  </style></head><body><header>${masthead}</header><main>${body}</main></body></html>`;

const PAGES: Record<string, string> = {
  "/blog": site("en", "Slow breakfasts", "The Morning Table", "#b45309", `
    <h1>The case for slow breakfasts</h1>
    <div class="byline">By Ana Ruiz · 6 min read</div>
    <p>On Sundays we <span id="eat">eat</span> late, at the long table by the window, and nobody is allowed to look at a phone.</p>
    <p>There is bread from the bakery on the corner, a pot of strong coffee, and whatever fruit is ripe that week.</p>
    <p>It is the one meal of the week that nobody rushes, <span id="phrase">and it is always the best part of the weekend</span>.</p>`),
  "/noticias": site("es", "Los mercados del barrio", "Diario del Sur", "#b91c1c", `
    <h1>Vuelven los mercados de barrio</h1>
    <div class="byline">Por Lucía Méndez · Sociedad</div>
    <p>Los sábados, las familias <span id="compran">compran</span> fruta, pan y queso en los mercados del centro.</p>
    <p>Los vendedores dicen que los jóvenes vuelven a interesarse por los productos locales y de temporada.</p>
    <p>«Aquí conoces a la gente que hace la comida», explica una clienta mientras paga.</p>`),
  "/magazine": site("fr", "Les jardins de Paris", "Le Petit Promeneur", "#047857", `
    <h1>Les jardins cachés de Paris</h1>
    <div class="byline">Par Claire Dubois · Balades</div>
    <p>Ces <span id="belles">belles</span> cours se cachent derrière les grandes avenues, loin du bruit et des voitures.</p>
    <p>Au printemps, les roses du jardin des Plantes attirent les promeneurs dès le matin.</p>
    <p>Prenez le temps de vous asseoir sur un banc et d'écouter la ville se réveiller.</p>`),
};

const server = Bun.serve({
  port: 0,
  fetch: (req) => {
    const page = PAGES[new URL(req.url).pathname];
    return page ? new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("", { status: 404 });
  },
});
const local = `http://localhost:${server.port}`;

// ── Framing: a caption beside a browser window holding the capture ──────────

const FRAME = { width: 1280, height: 800, captionWidth: 380, pad: 40, bar: 40 };
const CROP = {
  width: FRAME.width - FRAME.captionWidth - FRAME.pad * 2,
  height: FRAME.height - FRAME.pad * 2 - FRAME.bar,
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function framed(image: string, domain: string, title: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: ${FRAME.width}px; height: ${FRAME.height}px; display: flex; font-family: ${FONT};
    background: linear-gradient(135deg, ${BLUE}, #1e3a8a); color: #fff; overflow: hidden; }
  .caption { width: ${FRAME.captionWidth}px; box-sizing: border-box; padding: 64px 8px 0 48px; }
  .caption img { width: 72px; height: 72px; margin: 0 0 28px; background: #fff; border-radius: 18px; }
  h1 { font-size: 34px; line-height: 1.2; margin: 0 0 18px; letter-spacing: -.01em; }
  p { font-size: 18px; line-height: 1.5; margin: 0; color: #dbe4ff; }
  .window { margin: ${FRAME.pad}px; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
  .bar { height: ${FRAME.bar}px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #eceef3; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .url { margin-left: 14px; flex: 1; height: 24px; border-radius: 12px; background: #fff; color: #555; font-size: 13px; line-height: 24px; padding: 0 12px; }
  .shot { display: block; width: ${CROP.width}px; height: ${CROP.height}px; }
  </style></head><body>
  <div class="caption"><img src="${ICON}" alt=""><h1>${escape(title)}</h1><p>${escape(detail)}</p></div>
  <div class="window">
    <div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="url">${escape(domain)}</span></div>
    <img class="shot" src="data:image/png;base64,${image}">
  </div></body></html>`;
}

// ── Capture ─────────────────────────────────────────────────────────────────

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  // The page is shown at the size the frame holds it, so nothing is cropped
  // and the popup keeps itself in view as it does in a real window.
  viewport: { width: CROP.width, height: CROP.height },
  deviceScaleFactor: 1,
  colorScheme: "light",
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extId = new URL(worker.url()).host;
  await worker.evaluate(() => chrome.storage.sync.set({ learning: ["fr", "es", "el"], native: "en" }));
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close();

  const page = await context.newPage();
  const studio = await context.newPage();
  const popup = () => page.locator("paradigma-popup .lh-dialog");
  const panel = () => popup().locator("[role=tabpanel]:not([hidden])");

  const capture = async () => (await page.screenshot()).toString("base64");

  async function save(name: string, image: string, domain: string, title: string, detail: string) {
    await studio.setViewportSize({ width: FRAME.width, height: FRAME.height });
    await studio.setContent(framed(image, domain, title, detail));
    await studio.screenshot({ path: `${out}/${name}`, type: "jpeg", quality: 95 });
    console.log(`✓ ${name}`);
  }

  const open = async (path: string) => {
    await page.goto(`${local}${path}`);
    await page.waitForTimeout(600);
  };
  /** Scrolls the popup so `target` is at its top, with a little space above. */
  const scrollPopupTo = (target: Locator) => target.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    el.closest(".lh-dialog")!.scrollTop -= 12;
  });

  // 1. An English word, in every language being learned.
  await open("/blog");
  await page.locator("#eat").dblclick();
  await popup().getByText("Conjugation").first().waitFor({ timeout: 30_000 });
  const translation = await capture();
  await save("1-translate.jpg", translation, "themorningtable.example/slow-breakfasts",
    "Select a word. See it in every language you're learning.",
    "One tab per language, with translations grouped by meaning, gender and usage.");

  // 2. The full conjugation of the translation, in another tab.
  await popup().locator("[role=tab]", { hasText: "Spanish" }).click();
  await panel().locator("details.lh-table[open]").first().waitFor({ timeout: 30_000 });
  await scrollPopupTo(panel().locator(".lh-entry h3").first());
  await save("2-conjugation.jpg", await capture(), "themorningtable.example/slow-breakfasts",
    "Every form, not just the word.",
    "Full conjugation tables with pronouns, and adjectives by gender and number.");
  await page.keyboard.press("Escape");

  // 3. A word in a language being learned: meaning, form, and the other languages.
  await open("/noticias");
  await page.locator("#compran").dblclick();
  await popup().getByText("Conjugation").first().waitFor({ timeout: 30_000 });
  await save("3-explain.jpg", await capture(), "diariodelsur.example/sociedad/mercados",
    "Reading in Spanish? Know exactly what you're looking at.",
    "What it means, which form it is, and every other form, with tabs for your other languages.");
  await page.keyboard.press("Escape");

  // 4. Listening to any form.
  await open("/magazine");
  await page.locator("#belles").dblclick();
  await popup().getByRole("columnheader", { name: "Masculine singular" }).waitFor({ timeout: 30_000 });
  await popup().getByRole("button", { name: "Listen to “beaux”" }).click();
  await popup().locator(".lh-entry .lh-listen-status").first().filter({ hasText: /voice|recording/ }).waitFor({ timeout: 10_000 }).catch(() => {});
  await scrollPopupTo(popup().locator(".lh-formof").first());
  await save("4-listen.jpg", await capture(), "lepetitpromeneur.example/jardins-caches",
    "Hear every form.",
    "Native speakers' recordings from Wiktionary, or your computer's own voice, for any form in the tables.");
  await page.keyboard.press("Escape");

  // 5. Settings, and privacy.
  const options = await context.newPage();
  await options.setViewportSize({ width: CROP.width, height: CROP.height });
  await options.goto(`chrome-extension://${extId}/options/options.html`);
  await options.waitForTimeout(400);
  const settings = (await options.screenshot()).toString("base64");
  await save("5-settings.jpg", settings, "Paradigma settings",
    "Private by design.",
    "No account, no server, nothing collected. Only the words you look up are sent, straight to the dictionary.");
  await options.close();

  // Promo images: the icon, the name and what it does, beside the popup for the marquee.
  const promo = (width: number, height: number, withShot: boolean) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: ${width}px; height: ${height}px; display: flex; align-items: center; gap: 48px; overflow: hidden;
      font-family: ${FONT}; color: #fff; background: linear-gradient(135deg, ${BLUE}, #1e3a8a); }
    .text { padding-left: ${withShot ? 96 : 36}px; flex: ${withShot ? "0 0 520px" : "1"}; }
    .name { display: flex; align-items: center; gap: ${withShot ? 16 : 10}px; font-size: ${withShot ? 56 : 38}px; font-weight: 700; letter-spacing: -.01em; }
    .name img { width: ${withShot ? 80 : 56}px; height: ${withShot ? 80 : 56}px; margin-right: ${withShot ? 8 : 4}px; background: #fff; border-radius: ${withShot ? 20 : 14}px; }
    p { margin: ${withShot ? 20 : 12}px 0 0; font-size: ${withShot ? 26 : 19}px; line-height: 1.35; color: #dbe4ff; }
    .shot { border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,.35); width: 680px; height: 470px; object-fit: cover; object-position: 0 0; }
    </style></head><body><div class="text"><div class="name"><img src="${ICON}" alt="">Paradigma</div>
    <p>Every form of every word,<br>in every language you're learning.</p></div>
    ${withShot ? `<img class="shot" src="data:image/png;base64,${translation}">` : ""}</body></html>`;

  await studio.setViewportSize({ width: 440, height: 280 });
  await studio.setContent(promo(440, 280, false));
  await studio.screenshot({ path: `${out}/promo-small-440x280.jpg`, type: "jpeg", quality: 95 });
  console.log("✓ promo-small-440x280.jpg");
  await studio.setViewportSize({ width: 1400, height: 560 });
  await studio.setContent(promo(1400, 560, true));
  await studio.screenshot({ path: `${out}/promo-marquee-1400x560.jpg`, type: "jpeg", quality: 95 });
  console.log("✓ promo-marquee-1400x560.jpg");
} finally {
  await context.close();
  await server.stop(true);
}

console.log(`\nListing images are in ${out}`);
