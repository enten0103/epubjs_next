import { beforeEach, describe, expect, it } from "vite-plus/test";

import { mountReaderApp } from "../src/index.ts";

function getAppRoot(): HTMLElement {
  return document.body;
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected a button labeled "${label}" to exist.`);
  }

  return button;
}

function getAppText(): string {
  return getAppRoot().textContent ?? "";
}

describe("reader demo browser behavior", () => {
  beforeEach(() => {
    mountReaderApp(getAppRoot());
  });

  it("renders the opening page and disables backward navigation", () => {
    expect(getAppText()).toContain("EPUB Reader Demo");
    expect(getAppText()).toContain("Page 1 of 3");
    expect(getAppText()).toContain("Chapter 1: Opening the Book");
    expect(getButton("Previous page").disabled).toBe(true);
  });

  it("updates the page content when navigating forward and backward", () => {
    const previousButton = getButton("Previous page");
    const nextButton = getButton("Next page");

    nextButton.click();
    expect(getAppText()).toContain("Page 2 of 3");
    expect(getAppText()).toContain("Chapter 2: Keeping Your Place");
    expect(previousButton.disabled).toBe(false);

    nextButton.click();
    expect(getAppText()).toContain("Page 3 of 3");
    expect(getAppText()).toContain("Chapter 3: Reaching the End");
    expect(nextButton.disabled).toBe(true);

    previousButton.click();
    expect(getAppText()).toContain("Page 2 of 3");
  });
});
