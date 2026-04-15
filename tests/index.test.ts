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
      prefix: "/scroll-spilt/",
      addBook,
      removeBook: vi.fn(),
      dispose: vi.fn(),
    };

    currentReader = createReader({
      root: "reader",
      provider: TEST_PROVIDER,
      serviceWorker,
      book: TEST_BOOK,
      render: "scrollSpilt",
      events: {
        onDocumentChange(event) {
          seen.push(event.href);
        },
      },
    });

    await currentReader.ready;

    expect(addBook).toHaveBeenCalledWith(TEST_PROVIDER, TEST_BOOK.id);
    expect(currentReader.render).toBe("scrollSpilt");
    expect(currentReader.book).toBe(TEST_BOOK);
    expect(currentReader.iframe.parentElement?.id).toBe("reader");
    expect(currentReader.getCurrent().html).toBe("chapter-1.xhtml");
    expect(seen).toEqual(["chapter-1.xhtml"]);

    await currentReader.setLocation({
      html: "chapter-2.xhtml",
    });

    expect(currentReader.getCurrentSpineIndex()).toBe(1);
    expect(currentReader.iframe.contentWindow?.scrollY ?? Number.NaN).toBe(0);
    expect(seen).toEqual(["chapter-1.xhtml", "chapter-2.xhtml"]);

    await currentReader.setLocation({
      html: "chapter-1.xhtml",
      indexs: [0],
    });

    expect(currentReader.getCurrentSpineIndex()).toBe(0);
    expect(currentReader.iframe.contentWindow?.scrollY ?? Number.NaN).toBe(0);
    expect(seen).toEqual(["chapter-1.xhtml", "chapter-2.xhtml", "chapter-1.xhtml"]);

    await currentReader.setLocation({
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
    });

    expect(currentReader.getCurrent()).toEqual({
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
    });
    expect(seen).toEqual([
      "chapter-1.xhtml",
      "chapter-2.xhtml",
      "chapter-1.xhtml",
      "chapter-2.xhtml",
    ]);

    currentReader.destroy();
    currentReader = null;
    expect(disposeBook).toHaveBeenCalledOnce();
  });
});
