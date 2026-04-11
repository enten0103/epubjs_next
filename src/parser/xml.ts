export function parseXml(text: string, mime: DOMParserSupportedType = "application/xml"): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, mime);
  const errors = doc.getElementsByTagName("parsererror");
  if (errors && errors.length > 0) {
    throw new Error("XML parse error");
  }
  return doc;
}

export function firstElementByLocalName(root: ParentNode, localName: string): Element | null {
  const all = (root as Document).getElementsByTagName
    ? (root as Document).getElementsByTagName("*")
    : (root as Element).getElementsByTagName("*");
  for (const el of Array.from(all)) {
    if (el.localName === localName) return el;
  }
  return null;
}

export function childrenByLocalName(root: ParentNode, localName: string): Element[] {
  const out: Element[] = [];
  const all = (root as Document).getElementsByTagName
    ? (root as Document).getElementsByTagName("*")
    : (root as Element).getElementsByTagName("*");
  for (const el of Array.from(all)) {
    if (el.localName === localName) out.push(el);
  }
  return out;
}

export function getAttr(el: Element, name: string): string | undefined {
  const v = el.getAttribute(name);
  return v == null ? undefined : v;
}

export function textOf(el: Element | null | undefined): string | undefined {
  if (!el) return undefined;
  const t = el.textContent ?? "";
  const v = t.trim();
  return v === "" ? undefined : v;
}
