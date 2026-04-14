import { afterEach, describe, expect, it } from "vite-plus/test";

import { createReader } from "../src/index.ts";
import type { EpubBook } from "../src/parser/types.ts";

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

let currentReader: ReturnType<typeof createReader> | null = null;

afterEach(() => {
  currentReader?.context.destroy();
  currentReader = null;
  document.body.innerHTML = "";
});

describe("createReader", () => {
  it("creates the configured render and keeps controller plus context", async () => {
    document.body.innerHTML = `<div id="reader" style="width:320px;height:200px"></div>`;

    currentReader = createReader({
      prefix: "/scroll-spilt",
      root: "reader",
      book: TEST_BOOK,
      render: "scrollSpilt",
    });

    await currentReader.context.ready;

    expect(currentReader.render).toBe("scrollSpilt");
    expect(currentReader.context.book).toBe(TEST_BOOK);
    expect(currentReader.context.iframe.parentElement?.id).toBe("reader");
    expect(currentReader.controller.getCurrent().html).toBe("chapter-1.xhtml");

    await currentReader.controller.setLocation({
      html: "chapter-2.xhtml",
    });

    expect(currentReader.context.getCurrentSpineIndex()).toBe(1);
    expect(currentReader.context.iframe.contentWindow?.scrollY ?? Number.NaN).toBe(0);

    await currentReader.controller.setLocation({
      html: "chapter-1.xhtml",
      indexs: [0],
    });

    expect(currentReader.context.getCurrentSpineIndex()).toBe(0);
    expect(currentReader.context.iframe.contentWindow?.scrollY ?? Number.NaN).toBe(0);

    await currentReader.controller.setLocation({
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
    });

    expect(currentReader.controller.getCurrent()).toEqual({
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
    });
  });
});
