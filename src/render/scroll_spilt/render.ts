import type { EpubBook } from "../../parser/types.ts";
import { dirname, resolveEpubPath } from "../../parser/utils.ts";
import { createDrawer } from "../drawer.ts";
import type { ScrollSpiltController } from "./controller.ts";
import { useScrollSpiltController } from "./controller.ts";
import type { ScrollSpiltEvents } from "./event.ts";
import type { ScrollSpiltDocumentChangeListener } from "./event.ts";
import { createScrollSpiltDocumentChangeHook } from "./event.ts";

export type ScrollSpiltRenderContext = {
  iframe: HTMLIFrameElement;
  book: EpubBook;
  ready: Promise<void>;
  destroy: () => void;
  loadSpine: (index: number) => Promise<Document>;
  loadHref: (href: string) => Promise<Document>;
  getCurrentDocument: () => Document | null;
  getCurrentSpineIndex: () => number;
  onDocumentChange: (listener: ScrollSpiltDocumentChangeListener) => () => void;
};

export type ScrollSpiltRenderResult = ScrollSpiltRenderContext & {
  controller: ScrollSpiltController;
};

const getSpineItem = (book: EpubBook, index: number) => {
  const item = book.spine[index];
  if (!item) {
    throw new Error(`Spine index out of range: ${index}`);
  }
  return item;
};

const normalizeHref = (href: string): string => href.split("#", 1)[0] ?? href;

const resolveSpineIndex = (book: EpubBook, href: string): number => {
  const normalizedHref = normalizeHref(href);
  const index = book.spine.findIndex((item) => normalizeHref(item.href) === normalizedHref);
  if (index < 0) {
    throw new Error(`Cannot find html in spine: ${href}`);
  }
  return index;
};

const isExternalHref = (href: string): boolean => {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
};

const resolveDocumentNavigationHref = (currentHref: string, rawHref: string): string | null => {
  const trimmedHref = rawHref.trim();
  if (!trimmedHref || isExternalHref(trimmedHref)) {
    return null;
  }

  if (trimmedHref.startsWith("#")) {
    const currentPath = normalizeHref(currentHref);
    return trimmedHref.length > 1 ? `${currentPath}${trimmedHref}` : currentPath;
  }

  return resolveEpubPath(dirname(normalizeHref(currentHref)), trimmedHref);
};

export const scrollSpiltRender = (
  prefix: string,
  root: HTMLElement,
  book: EpubBook,
  events?: ScrollSpiltEvents,
): ScrollSpiltRenderResult => {
  book.resources = {
    ...book.resources,
    prefix,
  };

  const drawer = createDrawer(book);
  const onDocumentChangeHook = createScrollSpiltDocumentChangeHook(events);
  let currentSpineIndex = 0;
  let currentDocument: Document | null = null;
  let currentIframe: HTMLIFrameElement | null = null;
  let destroyed = false;

  const getCurrentHref = (): string => {
    const item = book.spine[currentSpineIndex];
    if (!item) {
      throw new Error(`Spine index out of range: ${currentSpineIndex}`);
    }
    return item.href;
  };

  const loadHref = async (href: string): Promise<Document> => {
    if (destroyed) {
      throw new Error("Render is destroyed");
    }

    const nextIndex = resolveSpineIndex(book, href);
    const renderResult = await drawer(root, href);
    if (destroyed) {
      renderResult.iframe.remove();
      throw new Error("Render is destroyed");
    }

    currentSpineIndex = nextIndex;
    currentDocument = renderResult.document;
    currentIframe = renderResult.iframe;
    renderResult.document.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const eventTarget = event.target;
      if (
        !eventTarget ||
        typeof eventTarget !== "object" ||
        !("closest" in eventTarget) ||
        typeof eventTarget.closest !== "function"
      ) {
        return;
      }

      const anchor = eventTarget.closest("a[href]");
      if (
        !anchor ||
        anchor.getAttribute("target") === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const rawHref = anchor.getAttribute("href");
      if (!rawHref) {
        return;
      }

      const nextHref = resolveDocumentNavigationHref(renderResult.href, rawHref);
      if (!nextHref) {
        return;
      }

      event.preventDefault();
      void loadHref(nextHref);
    });
    onDocumentChangeHook.emit({
      document: renderResult.document,
      href: getCurrentHref(),
      spineIndex: currentSpineIndex,
    });
    return renderResult.document;
  };

  const loadSpine = async (index: number): Promise<Document> => {
    return loadHref(getSpineItem(book, index).href);
  };

  const context: ScrollSpiltRenderContext = {
    get iframe() {
      if (!currentIframe) {
        throw new Error("Render is not ready yet");
      }
      return currentIframe;
    },
    book,
    ready: loadSpine(0).then(() => undefined),
    destroy() {
      destroyed = true;
      currentDocument = null;
      currentIframe?.remove();
      currentIframe = null;
    },
    loadHref,
    loadSpine,
    getCurrentDocument: () => currentDocument,
    getCurrentSpineIndex: () => currentSpineIndex,
    onDocumentChange: onDocumentChangeHook.on,
  };

  return Object.assign(context, {
    controller: useScrollSpiltController(context),
  });
};
