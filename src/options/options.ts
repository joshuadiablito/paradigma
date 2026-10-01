import { LANGUAGES, languageByCode } from "../shared/languages";
import { createSavedLookups, describeSavedLookups } from "../shared/saved-lookups";
import { SPANISH_VARIETIES, loadSettings, plausibleEmail, saveSettings, type Settings } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const savedLookups = createSavedLookups(chrome.storage.local);
const savedLookupsSizeEl = $<HTMLParagraphElement>("saved-lookups-size");

const learningEl = $<HTMLDivElement>("learning");
const nativeEl = $<HTMLSelectElement>("native");
const sitesEl = $<HTMLUListElement>("sites");
const emailEl = $<HTMLInputElement>("email");
const emailErrorEl = $<HTMLParagraphElement>("email-error");
const savedEl = $<HTMLParagraphElement>("saved");

let settings: Settings;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

/** Says what just happened in the status region, which screen readers announce. */
function announce(text: string, { fade = true } = {}): void {
  clearTimeout(savedTimer);
  savedEl.textContent = text;
  if (fade) savedTimer = setTimeout(() => (savedEl.textContent = ""), 4000);
}

async function save(next: Settings, what: string): Promise<void> {
  settings = next;
  await saveSettings(settings);
  announce(`Saved: ${what}.`);
}

function renderLearning(): void {
  learningEl.replaceChildren(
    ...LANGUAGES.map((lang) => {
      const input = Object.assign(document.createElement("input"), {
        type: "checkbox",
        value: lang.code,
        checked: settings.learning.includes(lang.code),
      });
      input.addEventListener("change", () => {
        const learning = input.checked
          ? [...settings.learning, lang.code]
          : settings.learning.filter((c) => c !== lang.code);
        void save({ ...settings, learning }, `${input.checked ? "learning" : "no longer learning"} ${lang.name}`)
          .then(renderSpanishVariety);
      });
      const label = document.createElement("label");
      const endonym = Object.assign(document.createElement("span"), { className: "endonym", lang: lang.code });
      endonym.textContent = lang.endonym === lang.name ? "" : ` (${lang.endonym})`;
      const text = document.createElement("span");
      text.append(lang.name, endonym);
      label.append(input, text);
      return label;
    }),
  );
}

const VARIETY_NAMES = { spain: "Spain", "latin-america": "Latin America", rioplatense: "Río de la Plata" } as const;

/** Only relevant, so only shown, when Spanish is being learned. */
function renderSpanishVariety(): void {
  $("spanish-variety").hidden = !settings.learning.includes("es");
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="spanish-variety"]')) {
    radio.checked = radio.value === settings.spanishVariety;
    radio.onchange = () => {
      const variety = SPANISH_VARIETIES.find((v) => v === radio.value);
      if (radio.checked && variety) void save({ ...settings, spanishVariety: variety }, `${VARIETY_NAMES[variety]} Spanish`);
    };
  }
}

function renderNative(): void {
  nativeEl.replaceChildren(
    ...LANGUAGES.map((l) => Object.assign(document.createElement("option"), { value: l.code, textContent: l.name })),
  );
  nativeEl.value = settings.native;
  nativeEl.onchange = () =>
    void save({ ...settings, native: nativeEl.value }, `my language is ${languageByCode(nativeEl.value)?.name}`);
}

function renderTrigger(): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="trigger"]')) {
    radio.checked = radio.value === settings.trigger;
    radio.onchange = () => {
      if (!radio.checked) return;
      const trigger = radio.value === "alt" ? "alt" : "select";
      void save({ ...settings, trigger }, trigger === "alt" ? "look up only when Alt is held" : "look up whenever text is selected");
    };
  }
}

function renderEmail(): void {
  emailEl.value = settings.myMemoryEmail;
  emailEl.onchange = () => {
    const typed = emailEl.value.trim();
    const email = plausibleEmail(typed);
    const invalid = typed !== "" && email === "";
    emailErrorEl.hidden = !invalid;
    // The error comes first so it's what a screen reader reads on returning to the field.
    emailEl.setAttribute("aria-describedby", invalid ? "email-error email-hint" : "email-hint");
    if (invalid) {
      emailEl.setAttribute("aria-invalid", "true");
      announce("Not saved: that doesn't look like an email address.", { fade: false });
      return;
    }
    emailEl.removeAttribute("aria-invalid");
    emailEl.value = email;
    void save({ ...settings, myMemoryEmail: email }, email ? "email address for MyMemory" : "removed the email address");
  };
}

function renderSites(): void {
  const hosts = Object.keys(settings.sites).sort();
  $("no-sites").hidden = hosts.length > 0;
  sitesEl.replaceChildren(
    ...hosts.map((host) => {
      const rule = settings.sites[host];
      const desc = rule?.mode === "on" ? `always on, as ${languageByCode(rule.lang)?.name ?? rule.lang}` : "always off";
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = `${host}: ${desc}`;
      const remove = Object.assign(document.createElement("button"), { type: "button", textContent: "Remove" });
      remove.setAttribute("aria-label", `Remove rule for ${host}`);
      remove.addEventListener("click", () => {
        const { [host]: _removed, ...sites } = settings.sites;
        void save({ ...settings, sites }, `removed the rule for ${host}`).then(() => {
          renderSites();
          // Keep keyboard focus in the list rather than dropping it to <body>.
          (sitesEl.querySelector("button") ?? $("no-sites")).focus();
        });
      });
      li.append(text, remove);
      return li;
    }),
  );
}

async function renderSavedLookups(): Promise<void> {
  savedLookupsSizeEl.textContent = describeSavedLookups(await savedLookups.stats());
}

$("clear-lookups").addEventListener("click", async () => {
  const cleared = await savedLookups.clear();
  await renderSavedLookups();
  announce(cleared ? "Cleared saved lookups." : "Couldn't clear saved lookups. Please try again.", { fade: cleared });
});

// Lookups made in other tabs while this page is open change what's saved.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void renderSavedLookups();
});

$("shortcuts").addEventListener("click", () => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

void loadSettings().then((s) => {
  settings = s;
  renderLearning();
  renderSpanishVariety();
  renderNative();
  renderTrigger();
  renderEmail();
  renderSites();
});

void renderSavedLookups();
