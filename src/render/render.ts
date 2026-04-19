import type { EpubBook } from "../parser/types.ts";
import { getHrefFragment, resolveDocumentNavigationHref, stripHrefFragment } from "../utils/url.ts";
import type { DrawerController } from "./controller.ts";
import { useDrawerController } from "./controller.ts";
import { createDrawer } from "./drawer.ts";
import type { DrawerDocumentChangeListener, DrawerEvents } from "./event.ts";
import { createDrawerDocumentChangeHook } from "./event.ts";
import type { EpubLocation } from "./location.ts";
import { createPaper } from "./paper.ts";
import type { CreatePaperOptions, Paper } from "./paper.ts";

export type DrawerReaderRenderContext = {
  iframe: HTMLIFrameElement;
  paper: Paper;
  book: EpubBook;
  ready: Promise<void>;
  destroy: () => void;
  loadLocation: (location: EpubLocation) => Promise<Document>;
  loadSpine: (index: number) => Promise<Document>;
  loadHref: (href: string) => Promise<Document>;
  getCurrentDocument: () => Document | null;
  getCurrentSpineIndex: () => number;
  onDocumentChange: (listener: DrawerDocumentChangeListener) => () => void;
};

export type DrawerReaderRenderResult = DrawerReaderRenderContext & {
  controller: DrawerController;
};

const getSpineItem = (book: EpubBook, index: number) => {
  const item = book.spine[index];
  if (!item) {
    throw new Error(`Spine index out of range: ${index}`);
  }
  return item;
};

const resolveSpineIndex = (book: EpubBook, href: string): number => {
  const normalizedHref = stripHrefFragment(href);
  const index = book.spine.findIndex((item) => stripHrefFragment(item.href) === normalizedHref);
  if (index < 0) {
    throw new Error(`Cannot find html in spine: ${href}`);
  }
  return index;
};

export const drawerRender = (
  prefix: string,
  root: HTMLElement,
  book: EpubBook,
  paperOptions?: CreatePaperOptions,
  events?: DrawerEvents,
): DrawerReaderRenderResult => {
  book.resources = {
    ...book.resources,
    prefix,
  };

  const paper = createPaper(root, paperOptions);
  const drawer = createDrawer(book);
  const onDocumentChangeHook = createDrawerDocumentChangeHook(events);
  let currentSpineIndex = 0;
  let currentDocument: Document | null = null;
  let destroyed = false;

  const getCurrentHref = (): string => {
    const item = book.spine[currentSpineIndex];
    if (!item) {
      throw new Error(`Spine index out of range: ${currentSpineIndex}`);
    }
    return item.href;
  };

  const attachDocumentNavigation = (documentToWatch: Document, currentHref: string) => {
    documentToWatch.addEventListener("click", (event) => {
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

      const nextHref = resolveDocumentNavigationHref(currentHref, rawHref);
      if (!nextHref) {
        return;
      }

      event.preventDefault();
      void loadLocation({
        html: stripHrefFragment(nextHref),
        fragment: getHrefFragment(nextHref) ?? undefined,
      });
    });
  };

  const loadLocation = async (location: EpubLocation): Promise<Document> => {
    if (destroyed) {
      throw new Error("Render is destroyed");
    }

    const nextIndex = resolveSpineIndex(book, location.html);
    const shouldEmitDocumentChange = currentDocument === null || nextIndex !== currentSpineIndex;
    const renderResult = await drawer(paper, location);
    if (destroyed) {
      throw new Error("Render is destroyed");
    }

    currentSpineIndex = nextIndex;
    currentDocument = renderResult.document;
    attachDocumentNavigation(renderResult.document, renderResult.href);
    if (shouldEmitDocumentChange) {
      onDocumentChangeHook.emit({
        document: renderResult.document,
        href: getCurrentHref(),
        spineIndex: currentSpineIndex,
      });
    }
    return renderResult.document;
  };

  const loadHref = async (href: string): Promise<Document> => {
    return loadLocation({
      html: href,
    });
  };

  const loadSpine = async (index: number): Promise<Document> => {
    return loadLocation({
      html: getSpineItem(book, index).href,
    });
  };

  const context: DrawerReaderRenderContext = {
    get iframe() {
      return paper.iframe;
    },
    paper,
    book,
    ready: loadSpine(0).then(() => undefined),
    destroy() {
      destroyed = true;
      currentDocument = null;
      paper.destroy();
    },
    loadLocation,
    loadHref,
    loadSpine,
    getCurrentDocument: () => currentDocument,
    getCurrentSpineIndex: () => currentSpineIndex,
    onDocumentChange: onDocumentChangeHook.on,
  };

  return Object.assign(context, {
    controller: useDrawerController(context),
  });
};
