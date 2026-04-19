import type { EpubLocation, PaperMode } from "./location.ts";

const PAPER_RUNTIME_API_KEY = "__EPUBJS_NEXT_PAPER__";

export type PaperRuntimeApi = {
  getCurrentLocation: (href: string) => EpubLocation;
  setLocation: (location: EpubLocation) => void;
  applyLocationFromUrl: (href: string) => void;
};

export type CreatePaperOptions = {
  mode?: PaperMode;
};

export type PaperRenderResult = {
  iframe: HTMLIFrameElement;
  document: Document;
  href: string;
};

export type Paper = {
  iframe: HTMLIFrameElement;
  readonly mode: PaperMode;
  readonly document: Document | null;
  readonly href: string | null;
  render: (href: string, src: string) => Promise<PaperRenderResult>;
  setMode: (mode: PaperMode) => Promise<void>;
  destroy: () => void;
};

const createPaperIframe = (): HTMLIFrameElement => {
  const iframe = document.createElement("iframe");
  iframe.src = "about:blank";
  iframe.style.display = "block";
  iframe.style.border = "0";
  iframe.style.maxWidth = "none";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  return iframe;
};

export const waitForPaperFrame = async (iframe: HTMLIFrameElement): Promise<void> => {
  return new Promise<void>((resolve) => {
    const viewportWindow = iframe.contentWindow;
    if (viewportWindow) {
      viewportWindow.requestAnimationFrame(() => {
        resolve();
      });
      return;
    }
    queueMicrotask(resolve);
  });
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

const installPaperRuntime = function () {
  const apiKey = "__EPUBJS_NEXT_PAPER__";
  const modeParam = "__epubjs_mode";
  const scrollParam = "__epubjs_scroll";
  const pageParam = "__epubjs_page";
  const pathParam = "__epubjs_path";
  const fragmentParam = "__epubjs_fragment";
  const runtimeWindow = window as unknown as Window & Record<string, unknown>;
  if (runtimeWindow[apiKey]) {
    return;
  }

  const clamp = function (value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  };

  const readUrl = function () {
    return new URL(window.location.href);
  };

  const getModeFromUrl = function (): PaperMode {
    const mode = readUrl().searchParams.get(modeParam);
    return mode === "paginated" ? "paginated" : "scroll";
  };

  const getViewportHeight = function () {
    return Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  };

  const getBodyElement = function (): HTMLElement | null {
    if (document.body) {
      return document.body;
    }

    const bodyElement = Array.from(document.getElementsByTagName("*")).find(function (element) {
      return element.localName === "body";
    });
    return bodyElement instanceof HTMLElement ? bodyElement : null;
  };

  const getContentRoot = function (): HTMLElement {
    return getBodyElement() || document.documentElement;
  };

  const getScroller = function () {
    return document.scrollingElement || document.documentElement;
  };

  const scrollTo = function (top: number) {
    getScroller().scrollTo({
      left: 0,
      top,
      behavior: "auto",
    });
  };

  const serializeIndexs = function (indexs?: readonly number[]): string | null {
    if (!indexs || indexs.length === 0) {
      return null;
    }
    return indexs.join(".");
  };

  const parseIndexs = function (raw: string | null): number[] | undefined {
    if (!raw) {
      return undefined;
    }

    const indexs = raw
      .split(".")
      .map(function (value) {
        return Number.parseInt(value, 10);
      })
      .filter(function (value) {
        return Number.isInteger(value) && value > 0;
      });
    return indexs.length > 0 ? indexs : undefined;
  };

  const readRequestedPageIndex = function () {
    return Math.max(0, Number.parseInt(readUrl().searchParams.get(pageParam) ?? "0", 10) || 0);
  };

  const readRequestedScrollTop = function () {
    return Math.max(0, Number.parseInt(readUrl().searchParams.get(scrollParam) ?? "0", 10) || 0);
  };

  const writeUrlState = function (location: EpubLocation) {
    const url = readUrl();
    const mode = location.position?.mode ?? getModeFromUrl();
    url.searchParams.set(modeParam, mode);

    const fragment = location.fragment?.trim();
    if (fragment) {
      url.searchParams.set(fragmentParam, fragment);
    } else {
      url.searchParams.delete(fragmentParam);
    }

    const path = serializeIndexs(location.indexs);
    if (path) {
      url.searchParams.set(pathParam, path);
    } else {
      url.searchParams.delete(pathParam);
    }

    if (mode === "paginated") {
      url.searchParams.set(
        pageParam,
        String(
          location.position?.mode === "paginated"
            ? Math.max(0, Math.floor(location.position.pageIndex))
            : 0,
        ),
      );
      url.searchParams.delete(scrollParam);
    } else {
      url.searchParams.set(
        scrollParam,
        String(
          location.position?.mode === "scroll"
            ? Math.max(0, Math.floor(location.position.scrollTop))
            : 0,
        ),
      );
      url.searchParams.delete(pageParam);
    }

    window.history.replaceState(null, "", url.toString());
  };

  const rememberDisplay = function (element: HTMLElement) {
    if (element.dataset.epubjsDisplay == null) {
      element.dataset.epubjsDisplay = element.style.display;
    }
  };

  const getPageElements = function (): HTMLElement[] {
    const root = getContentRoot();
    const directChildren = Array.from(root.children).filter(
      function (element): element is HTMLElement {
        return element instanceof HTMLElement;
      },
    );
    if (directChildren.length === 1) {
      const nestedChildren = Array.from(directChildren[0].children).filter(
        function (element): element is HTMLElement {
          return element instanceof HTMLElement;
        },
      );
      if (nestedChildren.length > 0) {
        return nestedChildren;
      }
    }
    if (directChildren.length > 0) {
      return directChildren;
    }
    return root instanceof HTMLElement ? [root] : [];
  };

  const restorePaginationElements = function () {
    for (const element of getPageElements()) {
      rememberDisplay(element);
      element.style.display = element.dataset.epubjsDisplay ?? "";
    }
  };

  const measurePages = function () {
    const elements = getPageElements();
    const visibleElements = new Set(
      elements.filter(function (element) {
        return element.style.display !== "none";
      }),
    );
    const requestedPageIndex = readRequestedPageIndex();
    restorePaginationElements();

    const pages: HTMLElement[][] = [];
    let currentPage: HTMLElement[] = [];
    let currentHeight = 0;
    const heightLimit = getViewportHeight();

    for (const element of elements) {
      rememberDisplay(element);
      element.style.display = element.dataset.epubjsDisplay ?? "";
      const height = Math.max(1, Math.ceil(element.getBoundingClientRect().height));
      if (currentPage.length > 0 && currentHeight + height > heightLimit) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
      }
      currentPage.push(element);
      currentHeight += height;
    }

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    const pageCount = Math.max(1, pages.length);
    const currentPageIndex =
      pages.findIndex(function (page) {
        return page.some(function (element) {
          return visibleElements.has(element);
        });
      }) >= 0
        ? pages.findIndex(function (page) {
            return page.some(function (element) {
              return visibleElements.has(element);
            });
          })
        : clamp(requestedPageIndex, 0, pageCount - 1);

    return {
      pages,
      currentPageIndex: clamp(currentPageIndex, 0, pageCount - 1),
      pageCount,
    };
  };

  const applyPage = function (pageIndex: number) {
    const measured = measurePages();
    const resolvedPageIndex = clamp(pageIndex, 0, measured.pageCount - 1);
    const visibleElements = new Set(measured.pages[resolvedPageIndex] ?? []);

    for (const element of getPageElements()) {
      rememberDisplay(element);
      element.style.display = visibleElements.has(element)
        ? (element.dataset.epubjsDisplay ?? "")
        : "none";
    }

    scrollTo(0);
    return {
      pageIndex: resolvedPageIndex,
      pageCount: measured.pageCount,
    };
  };

  const getCurrentPage = function () {
    const measured = measurePages();
    applyPage(measured.currentPageIndex);
    return {
      pageIndex: measured.currentPageIndex,
      pageCount: measured.pageCount,
    };
  };

  const normalizeLocationIndexs = function (indexs?: readonly number[]): number[] {
    if (!Array.isArray(indexs) || indexs.length === 0) {
      return [];
    }

    return indexs[0] === 0 ? indexs.slice(1) : indexs.slice();
  };

  const resolveElementByPath = function (root: Element, indexs: readonly number[]): Element | null {
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

  const buildElementPath = function (root: Element, target: Element): number[] {
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

  const findVisibleElement = function (): Element {
    const root = getContentRoot();
    const height = getViewportHeight();
    const probeYs = [1, 8, 16, 24, Math.floor(height / 4)].filter(function (
      value: number,
      index: number,
      values: number[],
    ) {
      return value < height && values.indexOf(value) === index;
    });

    for (const probeY of probeYs) {
      const elements: Element[] =
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(16, probeY)
          : [document.elementFromPoint(16, probeY)].filter(function (
              element: Element | null,
            ): element is Element {
              return element !== null;
            });
      for (const element of elements) {
        if (element === document.documentElement || element === document.body) {
          continue;
        }

        if (root.contains(element)) {
          return element;
        }
      }
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode();
    while (current) {
      const element = current as Element;
      const rect = element.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < height) {
        return element;
      }
      current = walker.nextNode();
    }

    return root.firstElementChild || root;
  };

  const resolveTarget = function (location: EpubLocation): Element {
    const root = getContentRoot();
    const fragment = typeof location.fragment === "string" ? location.fragment.trim() : "";
    if (fragment) {
      const targetById = document.getElementById(fragment);
      if (targetById) {
        return targetById;
      }

      throw new Error('Cannot resolve fragment "' + fragment + '" in ' + location.html);
    }

    const indexs = normalizeLocationIndexs(location.indexs);
    if (indexs.length === 0) {
      return root;
    }

    const target = resolveElementByPath(root, indexs);
    if (!target) {
      throw new Error(
        "Cannot resolve element path for " + location.html + ": [" + indexs.join(",") + "]",
      );
    }

    return target;
  };

  const findTargetPageIndex = function (target: Element): number {
    const measured = measurePages();
    const index = measured.pages.findIndex(function (page) {
      return page.some(function (element) {
        return element === target || element.contains(target);
      });
    });
    return index >= 0 ? index : 0;
  };

  const buildCurrentLocation = function (href: string): EpubLocation {
    const root = getContentRoot();
    const target = findVisibleElement();
    if (getModeFromUrl() === "paginated") {
      const currentPage = getCurrentPage();
      return {
        html: href,
        fragment: target && target.id ? target.id : undefined,
        indexs: target ? buildElementPath(root, target) : [],
        position: {
          mode: "paginated",
          pageIndex: currentPage.pageIndex,
          pageCount: currentPage.pageCount,
        },
      };
    }

    return {
      html: href,
      fragment: target && target.id ? target.id : undefined,
      indexs: target ? buildElementPath(root, target) : [],
      position: {
        mode: "scroll",
        scrollTop: Math.max(0, getScroller().scrollTop),
        maxScrollTop: Math.max(0, getScroller().scrollHeight - getViewportHeight()),
        viewportHeight: getViewportHeight(),
      },
    };
  };

  const applyScrollLocation = function (location: EpubLocation) {
    restorePaginationElements();

    if (
      location.position &&
      location.position.mode === "scroll" &&
      Number.isFinite(location.position.scrollTop)
    ) {
      scrollTo(
        clamp(
          location.position.scrollTop,
          0,
          Math.max(0, getScroller().scrollHeight - getViewportHeight()),
        ),
      );
      return;
    }

    const target = resolveTarget(location);
    const top = getScroller().scrollTop + target.getBoundingClientRect().top;
    scrollTo(clamp(top, 0, Math.max(0, getScroller().scrollHeight - getViewportHeight())));
  };

  const applyPaginatedLocation = function (location: EpubLocation) {
    if (
      location.position &&
      location.position.mode === "paginated" &&
      Number.isFinite(location.position.pageIndex)
    ) {
      applyPage(location.position.pageIndex);
      return;
    }

    applyPage(findTargetPageIndex(resolveTarget(location)));
  };

  const applyLocation = function (href: string, location: EpubLocation) {
    const mode = location.position?.mode ?? getModeFromUrl();
    writeUrlState({
      ...location,
      position:
        location.position?.mode === mode
          ? location.position
          : mode === "paginated"
            ? {
                mode,
                pageIndex: 0,
                pageCount: 1,
              }
            : {
                mode,
                scrollTop: 0,
                maxScrollTop: 0,
                viewportHeight: getViewportHeight(),
              },
    });

    if (mode === "paginated") {
      applyPaginatedLocation(location);
    } else {
      applyScrollLocation(location);
    }

    writeUrlState(buildCurrentLocation(href));
  };

  const readLocationFromUrl = function (href: string): EpubLocation {
    const url = readUrl();
    const fragment = url.searchParams.get(fragmentParam) || undefined;
    const indexs = parseIndexs(url.searchParams.get(pathParam));
    const hasPage = url.searchParams.has(pageParam);
    const hasScroll = url.searchParams.has(scrollParam);
    if (getModeFromUrl() === "paginated") {
      return {
        html: href,
        fragment,
        indexs,
        position: hasPage
          ? {
              mode: "paginated",
              pageIndex: readRequestedPageIndex(),
              pageCount: 1,
            }
          : undefined,
      };
    }

    return {
      html: href,
      fragment,
      indexs,
      position: hasScroll
        ? {
            mode: "scroll",
            scrollTop: readRequestedScrollTop(),
            maxScrollTop: 0,
            viewportHeight: getViewportHeight(),
          }
        : undefined,
    };
  };

  const api: PaperRuntimeApi = {
    getCurrentLocation: buildCurrentLocation,
    setLocation(location) {
      applyLocation(location.html, location);
    },
    applyLocationFromUrl(href) {
      applyLocation(href, readLocationFromUrl(href));
    },
  };

  runtimeWindow[apiKey] = api;
};

const PAPER_RUNTIME_SCRIPT = `;(${installPaperRuntime.toString()})();`;

const injectPaperRuntime = (doc: Document) => {
  const script = doc.createElement("script");
  script.type = "text/javascript";
  script.textContent = PAPER_RUNTIME_SCRIPT;
  doc.documentElement.appendChild(script);
  script.remove();
};

export const getPaperRuntime = (paperOrIframe: Paper | HTMLIFrameElement): PaperRuntimeApi => {
  const iframe = "iframe" in paperOrIframe ? paperOrIframe.iframe : paperOrIframe;
  const viewportWindow = iframe.contentWindow as (Window & Record<string, unknown>) | null;
  if (!viewportWindow) {
    throw new Error("Iframe window is unavailable");
  }

  const runtime = viewportWindow[PAPER_RUNTIME_API_KEY];
  if (!runtime) {
    throw new Error("Paper runtime is unavailable");
  }

  return runtime as PaperRuntimeApi;
};

export const createPaper = (root: HTMLElement, options?: CreatePaperOptions): Paper => {
  const iframe = createPaperIframe();
  root.replaceChildren(iframe);

  let currentMode: PaperMode = options?.mode ?? "scroll";
  let currentDocument: Document | null = null;
  let currentHref: string | null = null;
  let destroyed = false;

  return {
    iframe,
    get mode() {
      return currentMode;
    },
    get document() {
      return currentDocument;
    },
    get href() {
      return currentHref;
    },
    async render(href, src) {
      if (destroyed) {
        throw new Error("Paper is destroyed");
      }

      const doc = await waitForIframeLoad(iframe, () => {
        iframe.src = src;
      });
      if (destroyed) {
        throw new Error("Paper is destroyed");
      }

      doc.documentElement.setAttribute("data-epubjs-href", href);
      injectPaperRuntime(doc);
      currentDocument = doc;
      currentHref = href;
      getPaperRuntime(iframe).applyLocationFromUrl(href);
      await waitForPaperFrame(iframe);

      return {
        iframe,
        document: doc,
        href,
      };
    },
    async setMode(mode) {
      currentMode = mode;
    },
    destroy() {
      destroyed = true;
      currentDocument = null;
      currentHref = null;
      iframe.remove();
    },
  };
};
