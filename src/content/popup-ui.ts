import type { InflectionOptions } from "../shared/inflections";
import type { LookupResult } from "../shared/types";
import { h } from "./dom";
import popupCss from "./popup.css?inline";
import { renderResult } from "./render";

const GAP = 8;

/**
 * The lookup popup. Selecting text opens it without taking focus, so reading isn't
 * interrupted. Clicking into it, or opening it from the keyboard shortcut,
 * "pins" it: it then stays until closed with Escape, the close button, or a
 * click elsewhere, and focus returns to where it was.
 */
export class LookupPopup {
  readonly host: HTMLElement;
  readonly #doc: Document;
  readonly #dialog: HTMLElement;
  readonly #title: HTMLElement;
  readonly #body: HTMLElement;
  readonly #status: HTMLElement;
  #anchor: DOMRect | null = null;
  #returnFocus: HTMLElement | null = null;
  #query: string | null = null;
  pinned = false;

  constructor(doc: Document = document) {
    this.#doc = doc;
    this.host = doc.createElement("lekseis-hover-popup");
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = popupCss;

    this.#title = h(doc, "h2", { id: "lh-title" });
    this.#status = h(doc, "p", { class: "lh-status", role: "status" });
    this.#body = h(doc, "div", { class: "lh-body" });
    this.#dialog = h(doc, "div", {
      class: "lh-dialog",
      role: "dialog",
      "aria-labelledby": "lh-title",
      tabindex: "-1",
      hidden: true,
      onpointerdown: () => { this.pinned = true; },
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === "Escape") {
          e.stopPropagation();
          this.hide();
        }
      },
    },
      h(doc, "div", { class: "lh-titlebar" },
        this.#title,
        h(doc, "button", { type: "button", class: "lh-close", "aria-label": "Close", onclick: () => this.hide() }, "×"),
      ),
      this.#status,
      this.#body,
    );
    shadow.append(style, this.#dialog);
  }

  get isOpen(): boolean {
    return !this.#dialog.hidden;
  }

  get query(): string | null {
    return this.#query;
  }

  /** Whether an event target is inside the popup. */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && (target === this.host || this.host.contains(target));
  }

  showLoading(query: string, lang: string, anchor: DOMRect, opts: { focus: boolean }): void {
    if (!this.host.isConnected) this.#doc.documentElement.append(this.host);
    if (opts.focus && !this.isOpen) {
      const active = this.#doc.activeElement;
      this.#returnFocus = active instanceof HTMLElement ? active : null;
    }
    this.#query = query;
    this.#anchor = anchor;
    this.#title.textContent = query;
    this.#title.setAttribute("lang", lang);
    this.#status.textContent = "Looking up…";
    this.#body.replaceChildren();
    this.#dialog.hidden = false;
    this.pinned ||= opts.focus;
    this.#position();
    if (opts.focus) this.#dialog.focus({ preventScroll: true });
  }

  showResult(result: LookupResult, options: InflectionOptions = {}): void {
    this.#status.textContent = "";
    this.#body.replaceChildren(renderResult(this.#doc, result, { onPlayAudio: (url) => this.#play(url) }, options));
    this.#position();
  }

  showError(message: string): void {
    this.#status.textContent = message;
    this.#body.replaceChildren();
    this.#position();
  }

  hide(): void {
    if (!this.isOpen) return;
    const hadFocus = this.host.shadowRoot?.activeElement != null;
    this.#dialog.hidden = true;
    this.#query = null;
    this.pinned = false;
    if (hadFocus) this.#returnFocus?.focus({ preventScroll: true });
    this.#returnFocus = null;
  }

  #play(url: string): void {
    // Some sites' Content-Security-Policy blocks media from Wikimedia; open it instead.
    const audio = new Audio(url);
    audio.play().catch(() => window.open(url, "_blank", "noopener"));
  }

  /** Below the word if it fits, else above; kept inside the viewport. */
  #position(): void {
    const a = this.#anchor;
    if (!a) return;
    const vw = this.#doc.documentElement.clientWidth;
    const vh = this.#doc.documentElement.clientHeight;
    const { width, height } = this.#dialog.getBoundingClientRect();
    const below = a.bottom + GAP;
    const above = a.top - GAP - height;
    const top = below + height <= vh || above < GAP ? Math.min(below, Math.max(GAP, vh - height - GAP)) : above;
    const left = Math.min(Math.max(GAP, a.left), Math.max(GAP, vw - width - GAP));
    this.#dialog.style.top = `${Math.round(top)}px`;
    this.#dialog.style.left = `${Math.round(left)}px`;
  }
}
