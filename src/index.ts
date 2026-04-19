import type { EpubBook } from "./parser/types.ts";
import type { FileProvider } from "./provider/index.ts";
import { createEpubServiceWorker } from "./provider/server.ts";
import type { BookHandle, EpubServiceWorker } from "./provider/server.ts";
import { buildEpubBookPrefix } from "./provider/runtime.ts";
import type { DrawerController } from "./render/controller.ts";
import type { CreatePaperOptions, Paper } from "./render/paper.ts";
import type {
  DrawerDocumentChangeEvent,
  DrawerDocumentChangeListener,
  DrawerEvents,
} from "./render/event.ts";
import { drawerRender } from "./render/render.ts";
import type { DrawerReaderRenderResult } from "./render/render.ts";

export type { EpubBook, EpubBookResources } from "./parser/types.ts";
export type {
  EpubLocation,
  EpubLocationPosition,
  PaginatedLocationPosition,
  PaperMode,
  ScrollLocationPosition,
} from "./render/location.ts";
export type { Drawer, DrawerRenderResult } from "./render/drawer.ts";
export type { DrawerController } from "./render/controller.ts";
export type { CreatePaperOptions, Paper, PaperRenderResult } from "./render/paper.ts";
export type {
  DrawerDocumentChangeEvent,
  DrawerDocumentChangeListener,
  DrawerEvents,
} from "./render/event.ts";
export type { DrawerReaderRenderContext, DrawerReaderRenderResult } from "./render/render.ts";
export { createDrawer } from "./render/drawer.ts";
export { getCurrentLocation } from "./render/location.ts";
export { useDrawerController } from "./render/controller.ts";
export { createPaper } from "./render/paper.ts";
export { drawerRender } from "./render/render.ts";

export type ReaderRoot = string | HTMLElement;

export type ReaderRender = "drawer";

export type CreateReaderOptions = {
  prefix?: string;
  provider?: FileProvider;
  serviceWorker?: EpubServiceWorker | Promise<EpubServiceWorker>;
  root: ReaderRoot;
  book: EpubBook;
  render: ReaderRender;
  paper?: CreatePaperOptions;
  events?: ReaderEvents;
};

export type ReaderDocumentChangeEvent = DrawerDocumentChangeEvent;
export type ReaderDocumentChangeListener = DrawerDocumentChangeListener;
export type ReaderEvents = DrawerEvents;

export type DrawerReader = {
  render: "drawer";
} & Omit<DrawerReaderRenderResult, "controller" | "loadLocation"> &
  DrawerController & {
    paper: Paper;
  };

export type Reader = DrawerReader;

type DrawerReaderRuntime = {
  renderResult: DrawerReaderRenderResult;
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

const createDrawerReader = (options: CreateReaderOptions): DrawerReader => {
  const root = resolveRoot(options.root);
  let runtime: DrawerReaderRuntime | undefined;
  let setupPromise: Promise<DrawerReaderRuntime> | undefined;
  let destroyed = false;

  const destroyRuntime = (value: DrawerReaderRuntime) => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    value.renderResult.destroy();
    value.bookHandle?.dispose();
  };

  const ensureRuntime = async (): Promise<DrawerReaderRuntime> => {
    if (runtime) {
      return runtime;
    }
    if (setupPromise) {
      return setupPromise;
    }

    setupPromise = (async () => {
      const { renderPrefix, bookHandle } = await resolveRenderPrefix(options);
      const renderResult = drawerRender(
        renderPrefix,
        root,
        options.book,
        options.paper,
        options.events,
      );
      const nextRuntime: DrawerReaderRuntime = {
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

  const requireRuntime = (): DrawerReaderRuntime => {
    if (!runtime) {
      throw new Error("Reader is not ready yet");
    }
    return runtime;
  };

  return {
    render: "drawer",
    book: options.book,
    get paper() {
      return requireRuntime().renderResult.paper;
    },
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
    case "drawer":
      return createDrawerReader(options);
    default:
      throw new Error("unsupported render");
  }
};
