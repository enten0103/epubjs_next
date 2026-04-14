import { afterEach, describe, expect, it } from "vite-plus/test";

import type { EpubBook } from "../src/parser/types.ts";
import { scrollSpiltRender } from "../src/render/scroll_spilt/render.ts";

const TEST_PREFIX = "/scroll-spilt";

const TEST_BOOK: EpubBook = {
  id: "scroll-spilt-book",
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

const readers: Array<{ destroy: () => void }> = [];

const createRoot = () => {
  const root = document.createElement("div");
  root.style.width = "320px";
  root.style.height = "200px";
  document.body.appendChild(root);
  return root;
};

const getScrollTop = (iframe: HTMLIFrameElement): number => {
  const viewportWindow = iframe.contentWindow;
  if (!viewportWindow) {
    throw new Error("Missing iframe window");
  }
  return viewportWindow.scrollY;
};

const waitForIframeLoad = async (iframe: HTMLIFrameElement, trigger: () => void): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      requestAnimationFrame(() => {
        resolve();
      });
    };
    const onError = () => {
      cleanup();
      reject(new Error("Iframe navigation failed"));
    };
    iframe.addEventListener("load", onLoad);
    iframe.addEventListener("error", onError);
    trigger();
  });
};

const waitForCondition = async (predicate: () => boolean, attempts = 10): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }
  throw new Error("Condition was not met in time");
};

afterEach(() => {
  for (const reader of readers.splice(0)) {
    reader.destroy();
  }
  document.body.innerHTML = "";
});

describe("scrollSpiltRender", () => {
  it("renders a same-sized iframe and loads the first spine item", async () => {
    const root = createRoot();
    const reader = scrollSpiltRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;

    expect(root.firstElementChild).toBe(reader.iframe);
    expect(reader.iframe.style.width).toBe("320px");
    expect(reader.iframe.style.height).toBe("200px");
    expect(reader.iframe.contentDocument?.getElementById("chapter-1-root")).toBeTruthy();
    expect(reader.controller.getCurrent().html).toBe("chapter-1.xhtml");
  });

  it("scrolls within the current xhtml before switching to the next spine item", async () => {
    const root = createRoot();
    const reader = scrollSpiltRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;
    await reader.controller.next();

    const chapterOneBottom = getScrollTop(reader.iframe);
    expect(chapterOneBottom).toBeGreaterThan(0);
    expect(reader.controller.getCurrent().html).toBe("chapter-1.xhtml");

    await reader.controller.next();

    expect(reader.controller.getCurrent().html).toBe("chapter-2.xhtml");
    expect(getScrollTop(reader.iframe)).toBe(0);

    await reader.controller.prev();

    expect(reader.controller.getCurrent().html).toBe("chapter-1.xhtml");
    expect(getScrollTop(reader.iframe)).toBeGreaterThanOrEqual(chapterOneBottom - 1);
  });

  it("locates and reports positions by html href plus element path", async () => {
    const root = createRoot();
    const reader = scrollSpiltRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;

    const location = {
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
    };

    await reader.controller.setLocation(location);

    const target = reader.iframe.contentDocument?.getElementById("chapter-2-target");
    expect(target).toBeTruthy();
    expect(target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY).toBeLessThan(8);
    expect(reader.controller.getCurrent()).toEqual(location);
  });

  it("keeps reader state in sync when clicking internal xhtml links inside the iframe", async () => {
    const root = createRoot();
    const reader = scrollSpiltRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;

    const link = reader.iframe.contentDocument?.getElementById("chapter-1-link");
    if (!link || !("click" in link) || typeof link.click !== "function") {
      throw new Error("Missing internal chapter link");
    }

    await waitForIframeLoad(reader.iframe, () => {
      link.click();
    });

    await waitForCondition(() => {
      const target = reader.iframe.contentDocument?.getElementById("chapter-2-target");
      return (target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY) < 8;
    });

    const target = reader.iframe.contentDocument?.getElementById("chapter-2-target");
    expect(reader.getCurrentSpineIndex()).toBe(1);
    expect(reader.controller.getCurrent().html).toBe("chapter-2.xhtml");
    expect(target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY).toBeLessThan(8);
  });
});
