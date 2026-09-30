import { wordAt } from "../shared/word";

export interface Hit {
  text: string;
  /** Where the text is on screen, for positioning the popup. */
  rect: DOMRect;
  /** The element containing the text, for working out its language. */
  element: Element;
}

const SKIP = "input, textarea, select, [contenteditable=''], [contenteditable='true'], lekseis-hover-popup";

function caretAt(doc: Document, x: number, y: number): { node: Text; offset: number } | null {
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return pos.offsetNode instanceof Text ? { node: pos.offsetNode, offset: pos.offset } : null;
  const range = doc.caretRangeFromPoint?.(x, y);
  return range?.startContainer instanceof Text ? { node: range.startContainer, offset: range.startOffset } : null;
}

const within = (r: DOMRect, x: number, y: number, slop = 1) =>
  x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;

/** The selected text, if the pointer is over the selection. Selecting a phrase is how phrases get looked up. */
export function selectionUnderPoint(doc: Document, x: number, y: number): Hit | null {
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (![...range.getClientRects()].some((r) => within(r, x, y))) return null;
  const text = sel.toString().trim();
  const container = range.commonAncestorContainer;
  const element = container instanceof Element ? container : container.parentElement;
  if (!text || !element || element.closest(SKIP)) return null;
  return { text, rect: range.getBoundingClientRect(), element };
}

/**
 * The word under the pointer. The caret APIs return the nearest text position
 * even when the pointer is in a margin, so the word's own box is checked too.
 */
export function wordUnderPoint(
  doc: Document,
  x: number,
  y: number,
  languageOf: (element: Element) => string | null,
): (Hit & { lang: string }) | null {
  const caret = caretAt(doc, x, y);
  const element = caret?.node.parentElement;
  if (!caret || !element || element.closest(SKIP)) return null;
  const lang = languageOf(element);
  if (!lang) return null;

  const text = caret.node.data;
  // The caret sits *between* characters; on a word's right half it's after the last letter.
  const span = wordAt(text, caret.offset, lang) ?? (caret.offset > 0 ? wordAt(text, caret.offset - 1, lang) : null);
  if (!span) return null;

  const range = doc.createRange();
  range.setStart(caret.node, span.start);
  range.setEnd(caret.node, span.end);
  const rects = [...range.getClientRects()];
  const hitRect = rects.find((r) => within(r, x, y));
  if (!hitRect) return null;
  return { text: span.word, rect: hitRect, element, lang };
}
