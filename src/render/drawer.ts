import type { EpubBook } from "../parser/types.ts";
import {
  getHrefFragment,
  normalizeUrlPrefix,
  resolveBookResourceUrl,
  resolveDocumentBaseUrl,
  stripHrefFragment,
} from "../utils/url.ts";

export type DrawerRenderResult = {
  iframe: HTMLIFrameElement;
  document: Document;
  href: string;
};

export type Drawer = (root: HTMLElement, href: string) => Promise<DrawerRenderResult>;

const requireBookPrefix = (book: EpubBook): string => {
  const prefix = normalizeUrlPrefix(book.resources?.prefix);
  if (!prefix) {
    throw new Error("createDrawer requires book.resources.prefix");
  }
  return prefix;
};

const createDrawerIframe = (): HTMLIFrameElement => {
  const iframe = document.createElement("iframe");
  iframe.src = "about:blank";
  iframe.style.display = "block";
  iframe.style.border = "0";
  iframe.style.maxWidth = "none";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  return iframe;
};

const ensureHead = (doc: Document): HTMLHeadElement => {
  if (doc.head) {
    return doc.head;
  }

  const head = doc.createElement("head");
  const html = doc.documentElement;
  if (html.firstChild) {
    html.insertBefore(head, html.firstChild);
  } else {
    html.appendChild(head);
  }
  return head;
};

const buildSrcdoc = (xhtml: string, baseUrl: string): string => {
  const doc = new DOMParser().parseFromString(xhtml, "text/html");
  const head = ensureHead(doc);
  const existingBase = head.querySelector("base");
  if (existingBase) {
    existingBase.remove();
  }

  const base = doc.createElement("base");
  base.setAttribute("href", baseUrl);
  head.prepend(base);
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
};

const getViewportWindow = (doc: Document): Window => {
  const viewportWindow = doc.defaultView;
  if (!viewportWindow) {
    throw new Error("Iframe window is unavailable");
  }
  return viewportWindow;
};

const scrollToElement = (doc: Document, target: Element) => {
  const viewportWindow = getViewportWindow(doc);
  const top = viewportWindow.scrollY + target.getBoundingClientRect().top;
  viewportWindow.scrollTo({ top, behavior: "auto" });
};

const scrollToFragment = (doc: Document, href: string) => {
  const fragment = getHrefFragment(href);
  if (!fragment) {
    return;
  }

  const target = doc.getElementById(fragment);
  if (target) {
    scrollToElement(doc, target);
  }
};

const waitForIframeLoad = async (
  iframe: HTMLIFrameElement,
  trigger: () => void,
): Promise<Document> => {
  return new Promise<Document>((resolve, reject) => {
    const cleanup = () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanup();
      const finalizeLoad = () => {
        const loadedDocument = iframe.contentDocument;
        if (!loadedDocument) {
          reject(new Error("Rendered iframe has no document"));
          return;
        }
        resolve(loadedDocument);
      };

      const viewportWindow = iframe.contentWindow;
      if (viewportWindow) {
        viewportWindow.requestAnimationFrame(finalizeLoad);
        return;
      }
      queueMicrotask(finalizeLoad);
    };

    const onError = () => {
      cleanup();
      reject(new Error("Iframe rendering failed"));
    };

    iframe.addEventListener("load", onLoad);
    iframe.addEventListener("error", onError);
    trigger();
  });
};

const loadXhtml = async (book: EpubBook, href: string): Promise<string> => {
  const prefix = requireBookPrefix(book);
  const normalizedHref = stripHrefFragment(href);
  const response = await fetch(resolveBookResourceUrl(prefix, normalizedHref));
  if (!response.ok) {
    throw new Error(
      `Failed to load xhtml ${normalizedHref}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
};

export const createDrawer = (book: EpubBook): Drawer => {
  const drawer: Drawer = async (root, href) => {
    const prefix = requireBookPrefix(book);
    const normalizedHref = stripHrefFragment(href);
    const xhtml = await loadXhtml(book, normalizedHref);
    const iframe = createDrawerIframe();
    root.replaceChildren(iframe);

    const doc = await waitForIframeLoad(iframe, () => {
      iframe.srcdoc = buildSrcdoc(xhtml, resolveDocumentBaseUrl(prefix, normalizedHref));
    });

    scrollToFragment(doc, href);

    return {
      iframe,
      document: doc,
      href: normalizedHref,
    };
  };

  return drawer;
};
