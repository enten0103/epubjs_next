import type { EpubBook } from "./parser/types.ts";
import type { ScrollSpiltController } from "./render/scroll_spilt/controller.ts";
import { scrollSpiltRender } from "./render/scroll_spilt/render.ts";
import type { ScrollSpiltRenderResult } from "./render/scroll_spilt/render.ts";

export type { EpubBook } from "./parser/types.ts";
export type { EpubLocation } from "./render/location.ts";
export type { ScrollSpiltController } from "./render/scroll_spilt/controller.ts";
export type {
  ScrollSpiltRenderContext,
  ScrollSpiltRenderResult,
} from "./render/scroll_spilt/render.ts";
export { useScrollSpiltController } from "./render/scroll_spilt/controller.ts";
export { scrollSpiltRender } from "./render/scroll_spilt/render.ts";

export type ReaderRoot = string | HTMLElement;

export type ReaderRender = "scrollSpilt";

export type CreateReaderOptions = {
  prefix: string;
  root: ReaderRoot;
  book: EpubBook;
  render: ReaderRender;
};

export type ScrollSpiltReaderContext = Omit<ScrollSpiltRenderResult, "controller">;

export type ScrollSpiltReader = {
  render: "scrollSpilt";
  controller: ScrollSpiltController;
  context: ScrollSpiltReaderContext;
};

export type Reader = ScrollSpiltReader;

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

const createScrollSpiltReader = (options: CreateReaderOptions): ScrollSpiltReader => {
  const renderResult = scrollSpiltRender(options.prefix, resolveRoot(options.root), options.book);
  const { controller, ...context } = renderResult;
  return {
    render: "scrollSpilt",
    controller,
    context,
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
