import type { EpubBook } from "../../parser/types.ts";
import { useIframe } from "../iframe.ts";
import type { ScrollSpiltController } from "./controller.ts";
import { useScrollSpiltController } from "./controller.ts";

export type ScrollSpiltRenderContext = {
  iframe: HTMLIFrameElement;
  book: EpubBook;
  ready: Promise<void>;
  destroy: () => void;
  loadSpine: (index: number) => Promise<Document>;
  loadHref: (href: string) => Promise<Document>;
  getCurrentDocument: () => Document | null;
  getCurrentSpineIndex: () => number;
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

const normalizePrefix = (prefix: string): string => (prefix.endsWith("/") ? prefix : `${prefix}/`);

const resolveSpineIndex = (book: EpubBook, href: string): number => {
  const normalizedHref = normalizeHref(href);
  const index = book.spine.findIndex((item) => normalizeHref(item.href) === normalizedHref);
  if (index < 0) {
    throw new Error(`Cannot find html in spine: ${href}`);
  }
  return index;
};

const tryResolveSpineIndex = (book: EpubBook, href: string): number | null => {
  const normalizedHref = normalizeHref(href);
  const index = book.spine.findIndex((item) => normalizeHref(item.href) === normalizedHref);
  return index >= 0 ? index : null;
};

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

const scrollToElement = (doc: Document, target: Element) => {
  const viewportWindow = getViewportWindow(doc);
  const top = viewportWindow.scrollY + target.getBoundingClientRect().top;
  viewportWindow.scrollTo({ top, behavior: "auto" });
};

export const scrollSpiltRender = (
  prefix: string,
  root: HTMLElement,
  book: EpubBook,
): ScrollSpiltRenderResult => {
  const { iframe, setSrc } = useIframe(prefix);
  const prefixUrl = new URL(normalizePrefix(prefix), window.location.href);
  iframe.style.display = "block";
  iframe.style.border = "0";
  iframe.style.maxWidth = "none";
  iframe.style.width = `100%`;
  iframe.style.height = `100%`;
  root.replaceChildren(iframe);
  let currentSpineIndex = 0;
  let currentDocument: Document | null = null;

  const extractBookHref = (url: string): string | null => {
    const resolvedUrl = new URL(url, window.location.href);
    if (resolvedUrl.origin !== prefixUrl.origin) {
      return null;
    }
    if (!resolvedUrl.pathname.startsWith(prefixUrl.pathname)) {
      return null;
    }
    const relativePath = resolvedUrl.pathname.slice(prefixUrl.pathname.length).replace(/^\/+/, "");
    if (!relativePath) {
      return null;
    }
    const fragment = resolvedUrl.hash.replace(/^#/, "");
    return fragment ? `${relativePath}#${fragment}` : relativePath;
  };

  const syncCurrentDocument = (): Document | null => {
    const loadedDocument = iframe.contentDocument;
    if (!loadedDocument) {
      return null;
    }

    currentDocument = loadedDocument;
    const loadedHref = extractBookHref(iframe.contentWindow?.location.href ?? iframe.src);
    if (loadedHref) {
      const nextIndex = tryResolveSpineIndex(book, loadedHref);
      if (nextIndex !== null) {
        currentSpineIndex = nextIndex;
      }
    }
    return loadedDocument;
  };

  const navigateToBookHref = async (href: string): Promise<boolean> => {
    const nextIndex = tryResolveSpineIndex(book, href);
    if (nextIndex === null) {
      return false;
    }

    const [html, fragment] = href.split("#", 2);
    const doc = await loadHref(html ?? href);
    if (!fragment) {
      scrollToTop(doc);
      return true;
    }

    const target = doc.getElementById(fragment);
    if (target) {
      scrollToElement(doc, target);
    }
    return true;
  };

  // The iframe can navigate by itself when users click links inside EPUB content.
  // That bypasses the reader's navigation state, so we intercept "normal" left
  // clicks here and route book-internal links back through navigateToBookHref.
  // This keeps iframe navigation and reader state (currentSpineIndex/currentDocument)
  // on the same path, while still leaving modified clicks and non-reader links
  // to the browser's default behavior.
  const onDocumentClick = (event: MouseEvent) => {
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
    if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) {
      return;
    }

    // anchor.href is already resolved by the browser against the current iframe URL.
    // We convert that absolute URL back into an EPUB-relative href and only handle it
    // when it still points inside the current book prefix.
    const resolvedHref =
      "href" in anchor && typeof anchor.href === "string" ? extractBookHref(anchor.href) : null;
    if (!resolvedHref) {
      return;
    }

    // Prevent the iframe from navigating on its own; from here on the reader owns
    // the load + state sync + fragment scroll sequence.
    event.preventDefault();
    void navigateToBookHref(resolvedHref);
  };

  // Every loaded XHTML becomes a fresh Document, so the click bridge has to be
  // reattached after each iframe load.
  const bindDocumentNavigation = (doc: Document) => {
    doc.addEventListener("click", onDocumentClick);
  };

  const onIframeLoad = () => {
    const loadedDocument = syncCurrentDocument();
    if (loadedDocument) {
      bindDocumentNavigation(loadedDocument);
    }
  };

  iframe.addEventListener("load", onIframeLoad);

  const loadHref = async (href: string): Promise<Document> => {
    const nextIndex = resolveSpineIndex(book, href);
    if (currentDocument && currentSpineIndex === nextIndex) {
      return currentDocument;
    }

    const targetHref = normalizeHref(href);
    currentDocument = null;
    return new Promise<Document>((resolve, reject) => {
      const cleanup = () => {
        iframe.removeEventListener("load", onLoad);
        iframe.removeEventListener("error", onError);
      };

      const onLoad = () => {
        cleanup();
        const finalizeLoad = () => {
          const loadedDocument = syncCurrentDocument();
          if (!loadedDocument) {
            reject(new Error(`Loaded spine item has no document: ${targetHref}`));
            return;
          }
          resolve(loadedDocument);
        };

        const viewportWindow = iframe.contentWindow;
        if (viewportWindow) {
          viewportWindow.requestAnimationFrame(() => {
            finalizeLoad();
          });
          return;
        }
        queueMicrotask(finalizeLoad);
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load spine item: ${targetHref}`));
      };

      iframe.addEventListener("load", onLoad);
      iframe.addEventListener("error", onError);
      setSrc(targetHref);
    });
  };

  const loadSpine = async (index: number): Promise<Document> => {
    return loadHref(getSpineItem(book, index).href);
  };

  const context: ScrollSpiltRenderContext = {
    iframe,
    book,
    ready: loadSpine(0).then(() => undefined),
    destroy() {
      iframe.removeEventListener("load", onIframeLoad);
      iframe.remove();
    },
    loadHref,
    loadSpine,
    getCurrentDocument: () => currentDocument,
    getCurrentSpineIndex: () => currentSpineIndex,
  };

  return {
    ...context,
    controller: useScrollSpiltController(context),
  };
};
