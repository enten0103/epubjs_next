import type { EpubBook } from "../parser/types.ts";
import {
  getHrefFragment,
  normalizeUrlPrefix,
  resolveBookResourceUrl,
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

const buildIframeSrc = (prefix: string, href: string): string => {
  const resourceUrl = resolveBookResourceUrl(prefix, href);
  const fragment = getHrefFragment(href);
  return fragment ? `${resourceUrl}#${fragment}` : resourceUrl;
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

export const createDrawer = (book: EpubBook): Drawer => {
  const drawer: Drawer = async (root, href) => {
    const prefix = requireBookPrefix(book);
    const normalizedHref = stripHrefFragment(href);
    const iframe = createDrawerIframe();
    root.replaceChildren(iframe);

    const doc = await waitForIframeLoad(iframe, () => {
      iframe.src = buildIframeSrc(prefix, href);
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
