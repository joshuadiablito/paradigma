import { LANGUAGES, languageByCode } from "../shared/languages";
import {
  HOVER_DELAY_RANGE,
  SPANISH_VARIETIES,
  loadSettings,
  plausibleEmail,
  saveSettings,
  type Settings,
} from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const learningEl = $<HTMLDivElement>("learning");
const nativeEl = $<HTMLSelectElement>("native");
const delayEl = $<HTMLInputElement>("delay");
const sitesEl = $<HTMLUListElement>("sites");
const emailEl = $<HTMLInputElement>("email");
const emailErrorEl = $<HTMLParagraphElement>("email-error");
const savedEl = $<HTMLParagraphElement>("saved");

let settings: Settings;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

async function save(next: Settings, what: string): Promise<void> {
  settings = next;
  await saveSettings(settings);
  clearTimeout(savedTimer);
  savedEl.textContent = `Saved: ${what}.`;
  savedTimer = setTimeout(() => (savedEl.textContent = ""), 4000);
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
    void save({ ...settings, native: nativeEl.value }, `translating into ${languageByCode(nativeEl.value)?.name}`);
}

function renderTrigger(): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="trigger"]')) {
    radio.checked = radio.value === settings.trigger;
    radio.onchange = () => {
      if (!radio.checked) return;
      const trigger = radio.value === "alt" ? "alt" : "hover";
      void save({ ...settings, trigger }, trigger === "alt" ? "look up only while Alt is held" : "look up on hover");
    };
  }
}

function renderDelay(): void {
  Object.assign(delayEl, { min: HOVER_DELAY_RANGE.min, max: HOVER_DELAY_RANGE.max, value: settings.hoverDelayMs });
  $("delay-hint").textContent = `Between ${HOVER_DELAY_RANGE.min} and ${HOVER_DELAY_RANGE.max}.`;
  delayEl.onchange = () => {
    const value = Number(delayEl.value);
    if (!Number.isFinite(value) || value < HOVER_DELAY_RANGE.min || value > HOVER_DELAY_RANGE.max) {
      delayEl.setAttribute("aria-invalid", "true");
      savedEl.textContent = `Not saved: the delay must be between ${HOVER_DELAY_RANGE.min} and ${HOVER_DELAY_RANGE.max} milliseconds.`;
      return;
    }
    delayEl.removeAttribute("aria-invalid");
    void save({ ...settings, hoverDelayMs: value }, `delay of ${value} milliseconds`);
  };
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
      clearTimeout(savedTimer);
      savedEl.textContent = "Not saved: that doesn't look like an email address.";
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

$("shortcuts").addEventListener("click", () => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

void loadSettings().then((s) => {
  settings = s;
  renderLearning();
  renderSpanishVariety();
  renderNative();
  renderTrigger();
  renderDelay();
  renderEmail();
  renderSites();
});
