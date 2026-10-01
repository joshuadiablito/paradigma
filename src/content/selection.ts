export interface Selected {
  text: string;
  /** Where the selection is on screen, for positioning the popup. */
  rect: DOMRect;
  /** The element containing the selection, for working out its language. */
  element: Element;
}

/** Longer selections are almost certainly for copying, not looking up. */
export const MAX_SELECTION_CHARS = 300;

const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], paradigma-popup";

/**
 * The current selection, if it's something to look up: non-empty, not too
 * long, and not inside a text field (where selecting is editing, not reading).
 */
export function currentSelection(doc: Document): Selected | null {
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_SELECTION_CHARS) return null;
  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container instanceof Element ? container : container.parentElement;
  if (!element || element.closest(EDITABLE)) return null;
  return { text, rect: range.getBoundingClientRect(), element };
}
