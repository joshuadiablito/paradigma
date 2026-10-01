import { LANGUAGES, languageByCode } from "../shared/languages";
import { SPANISH_VARIETIES, loadSettings, saveSettings, type Settings } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const learningEl = $<HTMLDivElement>("learning");
const nativeEl = $<HTMLSelectElement>("native");
const sitesEl = $<HTMLUListElement>("sites");
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
  renderSites();
});
