import { describe, expect, it } from "vite-plus/test";

import { dirname, resolveEpubPath } from "../src/parser/utils.ts";

describe("dirname", () => {
  it("returns empty string for a bare filename", () => {
    expect(dirname("content.opf")).toBe("");
  });

  it("returns directory with trailing slash", () => {
    expect(dirname("OEBPS/content.opf")).toBe("OEBPS/");
  });

  it("handles nested paths", () => {
    expect(dirname("a/b/c/file.xml")).toBe("a/b/c/");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(dirname("OEBPS\\content.opf")).toBe("OEBPS/");
  });

  it("returns empty string for undefined / null coerced input", () => {
    expect(dirname("")).toBe("");
  });
});

describe("resolveEpubPath", () => {
  it("resolves a simple relative href against a base dir", () => {
    expect(resolveEpubPath("OEBPS/", "chapter1.xhtml")).toBe("OEBPS/chapter1.xhtml");
  });

  it("resolves parent directory references", () => {
    expect(resolveEpubPath("OEBPS/Text/", "../Styles/style.css")).toBe("OEBPS/Styles/style.css");
  });

  it("preserves fragment identifiers", () => {
    expect(resolveEpubPath("OEBPS/", "chapter1.xhtml#sec1")).toBe("OEBPS/chapter1.xhtml#sec1");
  });

  it("handles empty base dir", () => {
    expect(resolveEpubPath("", "content.opf")).toBe("content.opf");
  });

  it("strips leading slashes from base dir", () => {
    expect(resolveEpubPath("/OEBPS/", "ch1.xhtml")).toBe("OEBPS/ch1.xhtml");
  });

  it("handles empty href", () => {
    expect(resolveEpubPath("OEBPS/", "")).toBe("OEBPS/");
  });
});
