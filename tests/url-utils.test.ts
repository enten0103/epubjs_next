import { describe, expect, it } from "vite-plus/test";

import {
  buildBookScopedPrefix,
  getHrefFragment,
  isExternalHref,
  normalizeUrlPrefix,
  normalizeUrlPrefixOrDefault,
  resolveBookResourceUrl,
  resolveDocumentNavigationHref,
  resolveBookRootUrl,
  stripHrefFragment,
} from "../src/utils/url.ts";

describe("normalizeUrlPrefix", () => {
  it("normalizes configured prefixes into a slash-delimited namespace", () => {
    expect(normalizeUrlPrefix("epub")).toBe("/epub/");
    expect(normalizeUrlPrefix("/epub")).toBe("/epub/");
    expect(normalizeUrlPrefix("/epub/")).toBe("/epub/");
  });

  it("returns null for blank input", () => {
    expect(normalizeUrlPrefix("")).toBeNull();
    expect(normalizeUrlPrefix("   ")).toBeNull();
    expect(normalizeUrlPrefix(undefined)).toBeNull();
  });
});

describe("normalizeUrlPrefixOrDefault", () => {
  it("falls back to the provided default prefix", () => {
    expect(normalizeUrlPrefixOrDefault("", "/epubjs-next/")).toBe("/epubjs-next/");
  });
});

describe("buildBookScopedPrefix", () => {
  it("encodes book ids before appending them to the prefix", () => {
    expect(buildBookScopedPrefix("/epub/", "book 1/intro")).toBe("/epub/book%201%2Fintro");
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

describe("prefixed resource urls", () => {
  it("resolves the book root from the configured prefix", () => {
    expect(resolveBookRootUrl("/reader/book-1/", "https://reader.test/app/").toString()).toBe(
      "https://reader.test/reader/book-1/",
    );
  });

  it("builds fetch urls for XHTML resources", () => {
    expect(
      resolveBookResourceUrl(
        "/reader/book-1/",
        "Text/chapter-1.xhtml#sec-1",
        "https://reader.test/app/",
      ),
    ).toBe("https://reader.test/reader/book-1/Text/chapter-1.xhtml");
  });
});
