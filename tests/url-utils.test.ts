import { describe, expect, it } from "vite-plus/test";

import {
  dirname,
  getHrefFragment,
  isExternalHref,
  resolveEpubPath,
  resolveDocumentNavigationHref,
  stripHrefFragment,
} from "../src/utils/url.ts";

describe("epub path helpers", () => {
  it("computes an epub directory name", () => {
    expect(dirname("OPS/Text/chapter-1.xhtml")).toBe("OPS/Text/");
    expect(dirname("chapter-1.xhtml")).toBe("");
  });

  it("resolves relative epub paths while preserving fragments", () => {
    expect(resolveEpubPath("OPS/Text/", "../Styles/book.css")).toBe("OPS/Styles/book.css");
    expect(resolveEpubPath("OPS/Text/", "chapter-2.xhtml#sec-1")).toBe(
      "OPS/Text/chapter-2.xhtml#sec-1",
    );
  });
});

describe("href helpers", () => {
  it("strips fragments for document comparisons and fetches", () => {
    expect(stripHrefFragment("Text/chapter.xhtml#sec-1")).toBe("Text/chapter.xhtml");
  });

  it("reads fragments when they are present", () => {
    expect(getHrefFragment("Text/chapter.xhtml#sec-1")).toBe("sec-1");
    expect(getHrefFragment("Text/chapter.xhtml")).toBeNull();
  });

  it("detects external hrefs", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("//cdn.example.com/book.css")).toBe(true);
    expect(isExternalHref("chapter-2.xhtml")).toBe(false);
  });
});

describe("resolveDocumentNavigationHref", () => {
  it("keeps fragment-only links inside the current document", () => {
    expect(resolveDocumentNavigationHref("Text/chapter-1.xhtml", "#sec-2")).toBe(
      "Text/chapter-1.xhtml#sec-2",
    );
  });

  it("resolves relative XHTML navigation against the current document", () => {
    expect(resolveDocumentNavigationHref("Text/chapter-1.xhtml", "../Styles/book.css")).toBe(
      "Styles/book.css",
    );
  });

  it("ignores blank and external hrefs", () => {
    expect(resolveDocumentNavigationHref("Text/chapter-1.xhtml", "   ")).toBeNull();
    expect(resolveDocumentNavigationHref("Text/chapter-1.xhtml", "mailto:test@example.com")).toBe(
      null,
    );
  });
});
