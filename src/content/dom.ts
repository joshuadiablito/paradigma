// A tiny element builder. Everything shown in the popup comes from third-party
// APIs, so it is only ever inserted as text nodes — never as HTML.

type Child = Node | string | null | undefined | false;
type Attr = string | number | boolean | undefined | ((event: Event) => void);

export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, Attr> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(name.replace(/^on/, ""), value);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? doc.createTextNode(child) : child);
  }
  return el;
}
