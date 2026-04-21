import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { EpubBook } from "../src/parser/types.ts";
import type { FileProvider } from "../src/provider/index.ts";
import { createBookBlobResourceRuntime } from "../src/render/blob-resource.ts";

const TEST_BOOK: EpubBook = {
  id: "blob-runtime-book",
  pkg: {
    packagePath: "OEBPS/content.opf",
    packageDir: "OEBPS/",
  },
  manifest: new Map([
    [
      "chapter",
      {
        id: "chapter",
        href: "OEBPS/Text/chapter.xhtml",
        mediaType: "application/xhtml+xml",
      },
    ],
    [
      "style",
      {
        id: "style",
        href: "OEBPS/Styles/book.css",
        mediaType: "text/css",
      },
    ],
  ]),
  spine: [
    {
      idref: "chapter",
      href: "OEBPS/Text/chapter.xhtml",
      mediaType: "application/xhtml+xml",
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBookBlobResourceRuntime", () => {
  it("rewrites linked css font urls to blob assets without corrupting bytes", async () => {
    const fontBytes = Uint8Array.from([0, 1, 2, 3, 127, 128, 254, 255]);
    const provider: FileProvider = {
      async getTextByPath(path) {
        switch (path) {
          case "OEBPS/Text/chapter.xhtml":
            return `<?xml version="1.0" encoding="utf-8"?>
              <html xmlns="http://www.w3.org/1999/xhtml">
                <head>
                  <link rel="stylesheet" href="../Styles/book.css" />
                </head>
                <body>
                  <p id="chapter-root">hello</p>
                </body>
              </html>`;
          case "OEBPS/Styles/book.css":
            return `@font-face { font-family: Title; src: url("../Fonts/title.ttf"); }
              body { font-family: Title, serif; }`;
          default:
            throw new Error(`Unexpected text path: ${path}`);
        }
      },
      async getBolbByPath(path) {
        if (path === "OEBPS/Fonts/title.ttf") {
          return fontBytes;
        }
        throw new Error(`Unexpected binary path: ${path}`);
      },
    };

    const runtime = createBookBlobResourceRuntime(TEST_BOOK, provider);

    try {
      const documentContent = await runtime.getDocumentContent("OEBPS/Text/chapter.xhtml");
      const doc = new DOMParser().parseFromString(documentContent, "text/html");
      const cssHref = doc.querySelector('link[rel="stylesheet"]')?.getAttribute("href");

      expect(cssHref).toMatch(/^blob:/);

      const cssText = await fetch(cssHref!).then((response) => response.text());
      const fontBlobHref = cssText.match(/url\("([^"]+)"\)/)?.[1];

      expect(fontBlobHref).toMatch(/^blob:/);

      const fontResponse = await fetch(fontBlobHref!);
      const fontBuffer = await fontResponse.arrayBuffer();
      const fetchedFontBytes = new Uint8Array(fontBuffer);
      expect(Array.from(fetchedFontBytes)).toEqual(Array.from(fontBytes));
    } finally {
      runtime.dispose();
    }
  });

  it("warns and keeps rendering when a nested css asset is missing", async () => {
    const provider: FileProvider = {
      async getTextByPath(path) {
        switch (path) {
          case "OEBPS/Text/chapter.xhtml":
            return `<?xml version="1.0" encoding="utf-8"?>
              <html xmlns="http://www.w3.org/1999/xhtml">
                <head>
                  <link rel="stylesheet" href="../Styles/book.css" />
                </head>
                <body>
                  <p id="chapter-root">hello</p>
                </body>
              </html>`;
          case "OEBPS/Styles/book.css":
            return `@font-face { font-family: Title; src: url("../Fonts/title.ttf"); }
              body { font-family: Title, serif; }`;
          default:
            throw new Error(`Unexpected text path: ${path}`);
        }
      },
      async getBolbByPath(path) {
        throw new Error(`File not found in EPUB archive: ${path}`);
      },
    };

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = createBookBlobResourceRuntime(TEST_BOOK, provider);

    try {
      const documentContent = await runtime.getDocumentContent("OEBPS/Text/chapter.xhtml");
      expect(documentContent).toContain("chapter-root");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve asset "../Fonts/title.ttf"'),
      );
    } finally {
      runtime.dispose();
    }
  });
});
