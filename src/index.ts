import type { EpubBook } from "./parser/types.ts";
import type { FileProvider } from "./provider/index.ts";
import { createEpubServiceWorker } from "./provider/server.ts";
import type { BookHandle, EpubServiceWorker } from "./provider/server.ts";
import { buildEpubBookPrefix } from "./provider/runtime.ts";
import type { ScrollSpiltController } from "./render/scroll_spilt/controller.ts";
import type {
  ScrollSpiltDocumentChangeEvent,
  ScrollSpiltDocumentChangeListener,
  ScrollSpiltEvents,
} from "./render/scroll_spilt/event.ts";
import { scrollSpiltRender } from "./render/scroll_spilt/render.ts";
import type { ScrollSpiltRenderResult } from "./render/scroll_spilt/render.ts";

export type { EpubBook } from "./parser/types.ts";
export type { EpubLocation } from "./render/location.ts";
export type { ScrollSpiltController } from "./render/scroll_spilt/controller.ts";
export type {
  ScrollSpiltDocumentChangeEvent,
  ScrollSpiltDocumentChangeListener,
  ScrollSpiltEvents,
} from "./render/scroll_spilt/event.ts";
export type {
  ScrollSpiltRenderContext,
  ScrollSpiltRenderResult,
} from "./render/scroll_spilt/render.ts";
export { useScrollSpiltController } from "./render/scroll_spilt/controller.ts";
export { scrollSpiltRender } from "./render/scroll_spilt/render.ts";

export type ReaderRoot = string | HTMLElement;

export type ReaderRender = "scrollSpilt";

export type CreateReaderOptions = {
  prefix?: string;
  provider?: FileProvider;
  serviceWorker?: EpubServiceWorker | Promise<EpubServiceWorker>;
  root: ReaderRoot;
  book: EpubBook;
  render: ReaderRender;
  events?: ReaderEvents;
};

export type ReaderDocumentChangeEvent = ScrollSpiltDocumentChangeEvent;
export type ReaderDocumentChangeListener = ScrollSpiltDocumentChangeListener;
export type ReaderEvents = ScrollSpiltEvents;

export type ScrollSpiltReader = {
  render: "scrollSpilt";
} & Omit<ScrollSpiltRenderResult, "controller"> &
  ScrollSpiltController;

export type Reader = ScrollSpiltReader;

type ScrollSpiltReaderRuntime = {
  renderResult: ScrollSpiltRenderResult;
  bookHandle?: BookHandle;
};

const serviceWorkerCache = new Map<string, Promise<EpubServiceWorker>>();

const resolveRoot = (root: ReaderRoot): HTMLElement => {
  if (typeof root === "string") {
    const rootElement = document.getElementById(root);
    if (!rootElement) {
      throw new Error("cannot get element by id " + root);
    }
    if (!(rootElement instanceof HTMLElement)) {
      throw new Error("element is not an HTMLElement: " + root);
    }
    return rootElement;
  }

  return root;
};

const getCachedServiceWorker = (prefix?: string): Promise<EpubServiceWorker> => {
  const cacheKey = prefix ?? "__default__";
  const existing = serviceWorkerCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const next = createEpubServiceWorker(prefix ? { prefix } : undefined).catch((error) => {
    serviceWorkerCache.delete(cacheKey);
    throw error;
  });
  serviceWorkerCache.set(cacheKey, next);
  return next;
};

const resolveRenderPrefix = async (
  options: CreateReaderOptions,
): Promise<{
  renderPrefix: string;
  bookHandle?: BookHandle;
}> => {
  if (!options.provider) {
    if (!options.prefix) {
      throw new Error("prefix is required when provider is not supplied");
    }
    return {
      renderPrefix: options.prefix,
    };
  }

  const serviceWorker = await (options.serviceWorker
    ? Promise.resolve(options.serviceWorker)
    : getCachedServiceWorker(options.prefix));
  const bookHandle = serviceWorker.addBook(options.provider, options.book.id);
  const renderPrefix = buildEpubBookPrefix(serviceWorker.prefix, options.book.id);
  return {
    renderPrefix,
    bookHandle,
  };
};

const createScrollSpiltReader = (options: CreateReaderOptions): ScrollSpiltReader => {
  const root = resolveRoot(options.root);
  let runtime: ScrollSpiltReaderRuntime | undefined;
  let setupPromise: Promise<ScrollSpiltReaderRuntime> | undefined;
  let destroyed = false;

  const destroyRuntime = (value: ScrollSpiltReaderRuntime) => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    value.renderResult.destroy();
    value.bookHandle?.dispose();
  };

  const ensureRuntime = async (): Promise<ScrollSpiltReaderRuntime> => {
    if (runtime) {
      return runtime;
    }
    if (setupPromise) {
      return setupPromise;
    }

    setupPromise = (async () => {
      const { renderPrefix, bookHandle } = await resolveRenderPrefix(options);
      const renderResult = scrollSpiltRender(renderPrefix, root, options.book, options.events);
      const nextRuntime: ScrollSpiltReaderRuntime = {
        renderResult,
        bookHandle,
      };
      runtime = nextRuntime;

      if (destroyed) {
        nextRuntime.renderResult.destroy();
        nextRuntime.bookHandle?.dispose();
      }

      return nextRuntime;
    })();

    return setupPromise;
  };

  const requireRuntime = (): ScrollSpiltReaderRuntime => {
    if (!runtime) {
      throw new Error("Reader is not ready yet");
    }
    return runtime;
  };

  return {
    render: "scrollSpilt",
    book: options.book,
    get iframe() {
      return requireRuntime().renderResult.iframe;
    },
    get ready() {
      return ensureRuntime().then((value) => value.renderResult.ready);
    },
    destroy() {
      if (runtime) {
        destroyRuntime(runtime);
        return;
      }
      destroyed = true;
      if (setupPromise) {
        void setupPromise.then((value) => {
          value.renderResult.destroy();
          value.bookHandle?.dispose();
        });
      }
    },
    loadHref(href) {
      return ensureRuntime().then((value) => value.renderResult.loadHref(href));
    },
    loadSpine(index) {
      return ensureRuntime().then((value) => value.renderResult.loadSpine(index));
    },
    getCurrentDocument() {
      return requireRuntime().renderResult.getCurrentDocument();
    },
    getCurrentSpineIndex() {
      return requireRuntime().renderResult.getCurrentSpineIndex();
    },
    onDocumentChange(listener) {
      return requireRuntime().renderResult.onDocumentChange(listener);
    },
    setLocation(location) {
      return ensureRuntime().then((value) => value.renderResult.controller.setLocation(location));
    },
    getCurrent() {
      return requireRuntime().renderResult.controller.getCurrent();
    },
    next() {
      return ensureRuntime().then((value) => value.renderResult.controller.next());
    },
    prev() {
      return ensureRuntime().then((value) => value.renderResult.controller.prev());
    },
  };
};

export const createReader = (options: CreateReaderOptions): Reader => {
  switch (options.render) {
    case "scrollSpilt":
      return createScrollSpiltReader(options);
    default:
      throw new Error("unsupported render");
  }
};
