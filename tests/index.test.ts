import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createReader } from "../src/index.ts";
import type { EpubBook } from "../src/parser/types.ts";
import type { FileProvider } from "../src/provider/index.ts";
import type { EpubServiceWorker } from "../src/provider/server.ts";

const TEST_BOOK: EpubBook = {
  id: "reader-index-book",
  pkg: {
    packagePath: "content.opf",
    packageDir: "",
  },
  manifest: new Map(),
  spine: [
    {
      idref: "chapter-1",
      href: "chapter-1.xhtml",
      mediaType: "application/xhtml+xml",
    },
    {
      idref: "chapter-2",
      href: "chapter-2.xhtml",
      mediaType: "application/xhtml+xml",
    },
  ],
};

const TEST_PROVIDER: FileProvider = {
  getBolbByPath: async () => new Uint8Array(),
  getTextByPath: async () => "",
};

let currentReader: ReturnType<typeof createReader> | null = null;

afterEach(() => {
  currentReader?.destroy();
  currentReader = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("createReader", () => {
  it("auto-registers the book with its id and lets prefix come from the service worker", async () => {
    document.body.innerHTML = `<div id="reader" style="width:320px;height:200px"></div>`;
    const seen: string[] = [];
    const disposeBook = vi.fn();
    const addBook = vi.fn(() => ({
      id: TEST_BOOK.id,
      dispose: disposeBook,
    }));
    const serviceWorker: EpubServiceWorker = {
      prefix: "/paper-fixtures/",
      addBook,
      removeBook: vi.fn(),
      dispose: vi.fn(),
    };

    currentReader = createReader({
      root: "reader",
      provider: TEST_PROVIDER,
      serviceWorker,
      book: TEST_BOOK,
      render: "drawer",
      paper: {
        mode: "paginated",
      },
      events: {
        onDocumentChange(event) {
          seen.push(event.href);
        },
      },
    });

    await currentReader.ready;

    expect(addBook).toHaveBeenCalledWith(TEST_PROVIDER, TEST_BOOK.id);
    expect(currentReader.render).toBe("drawer");
    expect(currentReader.book).toBe(TEST_BOOK);
    expect(currentReader.paper.iframe.parentElement?.id).toBe("reader");
    expect(currentReader.iframe.parentElement?.id).toBe("reader");
    expect(currentReader.getCurrent().html).toBe("chapter-1.xhtml");
    expect(currentReader.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 0,
    });
    expect(seen).toEqual(["chapter-1.xhtml"]);

    const stableIframe = currentReader.iframe;

    await currentReader.next();

    expect(currentReader.getCurrentSpineIndex()).toBe(0);
    expect(currentReader.iframe).toBe(stableIframe);
    expect(currentReader.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 1,
    });
    expect(seen).toEqual(["chapter-1.xhtml"]);

    await currentReader.next();

    expect(currentReader.getCurrentSpineIndex()).toBe(1);
    expect(currentReader.iframe).toBe(stableIframe);
    expect(currentReader.iframe.contentDocument?.getElementById("chapter-2-root")).toBeTruthy();
    expect(seen).toEqual(["chapter-1.xhtml", "chapter-2.xhtml"]);

    await currentReader.setLocation({
      html: "chapter-2.xhtml",
      fragment: "chapter-2-target",
    });

    const target = currentReader.iframe.contentDocument?.getElementById("chapter-2-target");
    expect(target).toBeTruthy();
    expect(target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY).toBeLessThan(40);
    expect(currentReader.getCurrent()).toMatchObject({
      html: "chapter-2.xhtml",
      position: {
        mode: "paginated",
        pageIndex: 1,
      },
    });
    expect(seen).toEqual(["chapter-1.xhtml", "chapter-2.xhtml"]);

    await currentReader.prev();

    expect(currentReader.getCurrentSpineIndex()).toBe(1);
    expect(currentReader.iframe).toBe(stableIframe);
    expect(currentReader.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 0,
    });
    expect(seen).toEqual(["chapter-1.xhtml", "chapter-2.xhtml"]);

    await currentReader.prev();

    expect(currentReader.getCurrentSpineIndex()).toBe(0);
    expect(currentReader.iframe).toBe(stableIframe);
    expect(currentReader.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 1,
    });
    expect(seen).toEqual(["chapter-1.xhtml", "chapter-2.xhtml", "chapter-1.xhtml"]);

    currentReader.destroy();
    currentReader = null;
    expect(disposeBook).toHaveBeenCalledOnce();
  });
});
