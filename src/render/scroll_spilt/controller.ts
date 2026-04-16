import type { Controller } from "../controller.ts";
import type { EpubLocation } from "../location.ts";
import type { ScrollSpiltRenderContext } from "./render.ts";

export interface ScrollSpiltController extends Controller {
  next: () => Promise<void>;
  prev: () => Promise<void>;
}

const getBodyElement = (doc: Document): Element | null => {
  if (doc.body) {
    return doc.body;
  }

  return (
    Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "body") ??
    null
  );
};

const getContentRoot = (doc: Document): Element => getBodyElement(doc) ?? doc.documentElement;

const getViewportWindow = (doc: Document): Window => {
  const viewportWindow = doc.defaultView;
  if (!viewportWindow) {
    throw new Error("Iframe window is unavailable");
  }
  return viewportWindow;
};

const scrollToTop = (doc: Document) => {
  getViewportWindow(doc).scrollTo({ top: 0, behavior: "auto" });
};

const resolveElementByPath = (root: Element, indexs: readonly number[]): Element | null => {
  let current = root;
  for (const index of indexs) {
    if (!Number.isInteger(index) || index < 1) {
      return null;
    }
    const child = current.children.item(index - 1);
    if (!child) {
      return null;
    }
    current = child;
  }
  return current;
};

const normalizeLocationIndexs = (indexs?: readonly number[]): number[] => {
  if (!indexs || indexs.length === 0) {
    return [];
  }
  return indexs[0] === 0 ? indexs.slice(1) : [...indexs];
};

const buildElementPath = (root: Element, target: Element): number[] => {
  const path: number[] = [];
  let current: Element | null = target;
  while (current && current !== root) {
    const ancestor: Element | null = current.parentElement;
    if (!ancestor) {
      return [];
    }
    const index = Array.from(ancestor.children).indexOf(current);
    if (index < 0) {
      return [];
    }
    path.unshift(index + 1);
    current = ancestor;
  }
  return current === root ? path : [];
};

const findVisibleElement = (doc: Document): Element | null => {
  const root = getContentRoot(doc);
  const width = Math.max(1, doc.defaultView?.innerWidth ?? doc.documentElement.clientWidth);
  const height = Math.max(1, doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight);
  const probeX = Math.min(Math.max(Math.floor(width / 2), 1), Math.max(width - 1, 1));
  const probeYs = [1, 8, 16, 24, Math.floor(height / 4)].filter(
    (value, index, values) => value < height && values.indexOf(value) === index,
  );

  for (const probeY of probeYs) {
    const elements =
      typeof doc.elementsFromPoint === "function"
        ? doc.elementsFromPoint(probeX, probeY)
        : [doc.elementFromPoint(probeX, probeY)].filter(
            (element): element is Element => element !== null,
          );
    for (const element of elements) {
      if (element === doc.documentElement || element === doc.body) {
        continue;
      }
      if (root.contains(element)) {
        return element;
      }
    }
  }

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    const element = current as Element;
    const rect = element.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < height) {
      return element;
    }
    current = walker.nextNode();
  }

  return root.firstElementChild ?? root;
};

const scrollToElement = (doc: Document, target: Element) => {
  const viewportWindow = getViewportWindow(doc);
  const top = viewportWindow.scrollY + target.getBoundingClientRect().top;
  viewportWindow.scrollTo({ top, behavior: "auto" });
};

const buildCurrentLocation = (
  context: ScrollSpiltRenderContext,
  currentDocument: Document | null,
): EpubLocation => {
  const currentItem = context.book.spine[context.getCurrentSpineIndex()];
  if (!currentItem) {
    throw new Error("Cannot resolve current spine item");
  }
  if (!currentDocument) {
    return {
      html: currentItem.href,
      indexs: [],
    };
  }
  const root = getContentRoot(currentDocument);
  const target = findVisibleElement(currentDocument);
  return {
    html: currentItem.href,
    indexs: target ? buildElementPath(root, target) : [],
  };
};

export const useScrollSpiltController = (
  context: ScrollSpiltRenderContext,
): ScrollSpiltController => ({
  async setLocation(location) {
    const doc = await context.loadHref(location.html);
    const indexs = normalizeLocationIndexs(location.indexs);
    if (indexs.length === 0) {
      scrollToTop(doc);
      return;
    }

    const target = resolveElementByPath(getContentRoot(doc), indexs);
    if (!target) {
      throw new Error(`Cannot resolve element path for ${location.html}: [${indexs.join(",")}]`);
    }
    scrollToElement(doc, target);
  },

  getCurrent() {
    return buildCurrentLocation(context, context.getCurrentDocument());
  },

  async next() {
    const nextIndex = context.getCurrentSpineIndex() + 1;
    if (nextIndex >= context.book.spine.length) {
      return;
    }

    await context.loadSpine(nextIndex);
  },

  async prev() {
    const prevIndex = context.getCurrentSpineIndex() - 1;
    if (prevIndex < 0) {
      return;
    }

    await context.loadSpine(prevIndex);
  },
});
