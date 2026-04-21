import type { EpubBook } from "./parser/types.ts";
import type { FileProvider } from "./provider/index.ts";
import type { DrawerController } from "./render/controller.ts";
import type { CreatePaperOptions, Paper } from "./render/paper.ts";
import type {
  DrawerDocumentChangeEvent,
  DrawerDocumentChangeListener,
  DrawerEvents,
} from "./render/event.ts";
import { drawerRender } from "./render/render.ts";
import type { DrawerReaderRenderResult } from "./render/render.ts";

export type { EpubBook } from "./parser/types.ts";
export type {
  EpubLocation,
  EpubLocationPosition,
  PaginatedLocationPosition,
  PaperMode,
  ScrollLocationPosition,
} from "./render/location.ts";
export type { Drawer, DrawerRenderResult } from "./render/drawer.ts";
export type { DrawerController } from "./render/controller.ts";
export type { BookBlobResourceRuntime } from "./render/blob-resource.ts";
export type { CreatePaperOptions, Paper, PaperRenderResult } from "./render/paper.ts";
export type {
  DrawerDocumentChangeEvent,
  DrawerDocumentChangeListener,
  DrawerEvents,
} from "./render/event.ts";
export type { DrawerReaderRenderContext, DrawerReaderRenderResult } from "./render/render.ts";
export { createDrawer } from "./render/drawer.ts";
export { createBookBlobResourceRuntime } from "./render/blob-resource.ts";
export { getCurrentLocation } from "./render/location.ts";
export { useDrawerController } from "./render/controller.ts";
export { createPaper } from "./render/paper.ts";
export { drawerRender } from "./render/render.ts";

export type ReaderRoot = string | HTMLElement;

export type ReaderRender = "drawer";

export type CreateReaderOptions = {
  provider: FileProvider;
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

const createDrawerReader = (options: CreateReaderOptions): DrawerReader => {
  const renderResult = drawerRender(
    resolveRoot(options.root),
    options.book,
    options.provider,
    options.paper,
    options.events,
  );

  return {
    render: "drawer",
    book: options.book,
    get paper() {
      return renderResult.paper;
    },
    get iframe() {
      return renderResult.iframe;
    },
    get ready() {
      return renderResult.ready;
    },
    destroy() {
      renderResult.destroy();
    },
    loadHref(href) {
      return renderResult.loadHref(href);
    },
    loadSpine(index) {
      return renderResult.loadSpine(index);
    },
    getCurrentDocument() {
      return renderResult.getCurrentDocument();
    },
    getCurrentSpineIndex() {
      return renderResult.getCurrentSpineIndex();
    },
    onDocumentChange(listener) {
      return renderResult.onDocumentChange(listener);
    },
    setLocation(location) {
      return renderResult.ready.then(() => renderResult.controller.setLocation(location));
    },
    getCurrent() {
      return renderResult.controller.getCurrent();
    },
    next() {
      return renderResult.ready.then(() => renderResult.controller.next());
    },
    prev() {
      return renderResult.ready.then(() => renderResult.controller.prev());
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
