// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_SELECTION_CHARS, currentSelection } from "./selection";

function select(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
}

// jsdom has no layout, so ranges have no geometry.
Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10);

describe("currentSelection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.getSelection()!.removeAllRanges();
  });

  it("returns the selected text with whitespace tidied", () => {
    document.body.innerHTML = "<p id=p>  good\n   morning </p>";
    select(document.getElementById("p")!);
    expect(currentSelection(document)?.text).toBe("good morning");
    expect(currentSelection(document)?.element.id).toBe("p");
  });

  it("returns nothing when nothing is selected", () => {
    document.body.innerHTML = "<p>hello</p>";
    expect(currentSelection(document)).toBeNull();
  });

  it("ignores long selections, which are for copying", () => {
    document.body.innerHTML = `<p id=p>${"word ".repeat(MAX_SELECTION_CHARS)}</p>`;
    select(document.getElementById("p")!);
    expect(currentSelection(document)).toBeNull();
  });

  it("ignores selections in editable content", () => {
    document.body.innerHTML = "<div contenteditable=true><p id=p>draft</p></div>";
    select(document.getElementById("p")!);
    expect(currentSelection(document)).toBeNull();
  });
});
