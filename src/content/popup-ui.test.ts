// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
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

  it("does not take focus when opened by hovering", () => {
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

  it("recognises events from inside itself", () => {
    popup.showLoading("mange", "fr", rect, { focus: false });
    expect(popup.contains(popup.host)).toBe(true);
    expect(popup.contains(button)).toBe(false);
  });
});
