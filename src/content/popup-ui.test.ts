// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageOutcome, TranslateResult } from "../shared/types";
import { LookupPopup } from "./popup-ui";

const rect = new DOMRect(100, 100, 40, 16);
const dialog = (p: LookupPopup) => p.host.shadowRoot!.querySelector<HTMLElement>("[role=dialog]")!;

describe("LookupPopup", () => {
  let popup: LookupPopup;
  let button: HTMLButtonElement;

  beforeEach(() => {
    document.body.replaceChildren();
    button = document.createElement("button");
    document.body.append(button);
    popup = new LookupPopup(document);
  });

  it("is a labelled dialog titled with the looked-up text", () => {
    popup.showLoading("mange", "fr", rect, { focus: false });
    const d = dialog(popup);
    const title = popup.host.shadowRoot!.getElementById(d.getAttribute("aria-labelledby")!)!;
    expect(title.textContent).toBe("mange");
    expect(title.getAttribute("lang")).toBe("fr");
  });

  it("does not take focus when opened by selecting with the mouse", () => {
    button.focus();
    popup.showLoading("mange", "fr", rect, { focus: false });
    expect(document.activeElement).toBe(button);
    expect(popup.pinned).toBe(false);
  });

  it("takes focus when opened from the keyboard, and returns it on Escape", () => {
    button.focus();
    popup.showLoading("mange", "fr", rect, { focus: true });
    expect(popup.host.shadowRoot!.activeElement).toBe(dialog(popup));
    dialog(popup).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popup.isOpen).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("announces loading and errors through a status region", () => {
    popup.showLoading("mange", "fr", rect, { focus: false });
    const status = popup.host.shadowRoot!.querySelector("[role=status]")!;
    expect(status.textContent).toBe("Looking up…");
    popup.showError("Dictionary unavailable");
    expect(status.textContent).toBe("Dictionary unavailable");
  });

  it("closes from its close button", () => {
    popup.showLoading("mange", "fr", rect, { focus: true });
    popup.host.shadowRoot!.querySelector<HTMLButtonElement>("button[aria-label=Close]")!.click();
    expect(popup.isOpen).toBe(false);
  });

  describe("a translation's other languages", () => {
    const result = (query: string): TranslateResult => ({
      kind: "translate",
      query,
      lang: "en",
      languages: ["fr", "es"],
      first: { lang: "fr", outcome: { ok: true, result: { lang: "fr", senses: [], machine: `fr:${query}` } } },
      warnings: [],
    });
    const shadow = () => popup.host.shadowRoot!;
    const tick = () => new Promise((r) => setTimeout(r, 0));

    function deferredActions() {
      const pending: ((outcome: LanguageOutcome) => void)[] = [];
      const loadLanguage = vi.fn(() => new Promise<LanguageOutcome>((resolve) => pending.push(resolve)));
      return { actions: { loadLanguage, onChooseLanguage: vi.fn() }, loadLanguage, pending };
    }
    const spanish = (text: string): LanguageOutcome => ({ ok: true, result: { lang: "es", senses: [], machine: text } });

    it("loads a language when its tab is chosen, and keeps focus on the tab when it arrives", async () => {
      const { actions, loadLanguage, pending } = deferredActions();
      popup.showLoading("eat", "en", rect, { focus: true });
      popup.showResult(result("eat"), actions);
      const tab = shadow().querySelectorAll<HTMLElement>("[role=tab]")[1]!;
      tab.focus();
      tab.click();
      expect(loadLanguage).toHaveBeenCalledWith("es");
      pending[0]!(spanish("comer"));
      await tick();
      expect(shadow().querySelector("[role=tabpanel]:not([hidden])")?.textContent).toContain("comer");
      expect(shadow().activeElement).toBe(tab);
    });

    it("ignores a language that arrives after a newer lookup has replaced the result", async () => {
      const { actions, pending } = deferredActions();
      popup.showLoading("eat", "en", rect, { focus: false });
      popup.showResult(result("eat"), actions);
      const oldPanel = shadow().querySelectorAll("[role=tabpanel]")[1]!;
      shadow().querySelectorAll<HTMLElement>("[role=tab]")[1]!.click();

      popup.showLoading("house", "en", rect, { focus: false });
      popup.showResult(result("house"), deferredActions().actions);
      pending[0]!(spanish("comer"));
      await tick();
      expect(shadow().textContent).not.toContain("comer");
      expect(oldPanel.textContent).not.toContain("comer");
    });

    it("ignores a language that arrives after the popup has closed", async () => {
      const { actions, pending } = deferredActions();
      popup.showLoading("eat", "en", rect, { focus: false });
      popup.showResult(result("eat"), actions);
      const panel = shadow().querySelectorAll("[role=tabpanel]")[1]!;
      shadow().querySelectorAll<HTMLElement>("[role=tab]")[1]!.click();
      popup.hide();
      pending[0]!(spanish("comer"));
      await tick();
      expect(panel.textContent).not.toContain("comer");
    });
  });

  it("recognises events from inside itself", () => {
    popup.showLoading("mange", "fr", rect, { focus: false });
    expect(popup.contains(popup.host)).toBe(true);
    expect(popup.contains(button)).toBe(false);
  });
});
