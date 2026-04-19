import { afterEach, describe, expect, it } from "vite-plus/test";

import type { EpubBook } from "../src/parser/types.ts";
import { createDrawer } from "../src/render/drawer.ts";
import type { DrawerDocumentChangeEvent } from "../src/render/event.ts";
import { createPaper } from "../src/render/paper.ts";
import { drawerRender } from "../src/render/render.ts";
import { resolveBookResourceUrl } from "../src/utils/url.ts";

const TEST_PREFIX = "/paper-fixtures";

const TEST_BOOK: EpubBook = {
  id: "paper-fixtures-book",
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
  resources: {
    prefix: TEST_PREFIX,
  },
};

const readers: Array<{ destroy: () => void }> = [];
const papers: Array<{ destroy: () => void }> = [];

const createRoot = () => {
  const root = document.createElement("div");
  root.style.width = "320px";
  root.style.height = "200px";
  document.body.appendChild(root);
  return root;
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
  for (const paper of papers.splice(0)) {
    paper.destroy();
  }
  document.body.innerHTML = "";
});

describe("createDrawer", () => {
  it("requires a configured book render prefix", async () => {
    const root = createRoot();
    const paper = createPaper(root);
    papers.push(paper);
    const drawer = createDrawer({
      ...TEST_BOOK,
      resources: undefined,
    });

    await expect(
      drawer(paper, {
        html: "chapter-1.xhtml",
      }),
    ).rejects.toThrow("createDrawer requires book.resources.prefix");
  });

  it("renders EPUB documents onto a stable paper iframe", async () => {
    const root = createRoot();
    const paper = createPaper(root);
    papers.push(paper);
    const drawer = createDrawer(TEST_BOOK);

    const firstDraw = await drawer(paper, {
      html: "chapter-1.xhtml",
    });
    const secondDraw = await drawer(paper, {
      html: "chapter-2.xhtml",
      fragment: "chapter-2-target",
    });

    expect(root.firstElementChild).toBe(secondDraw.iframe);
    expect(firstDraw.iframe).toBe(secondDraw.iframe);
    expect(secondDraw.iframe.style.width).toBe("100%");
    expect(secondDraw.iframe.style.height).toBe("100%");
    const renderUrl = new URL(secondDraw.iframe.src);
    expect(renderUrl.origin + renderUrl.pathname).toBe(
      resolveBookResourceUrl(TEST_PREFIX, "chapter-2.xhtml"),
    );
    expect(renderUrl.searchParams.get("__epubjs_mode")).toBe("scroll");
    expect(renderUrl.searchParams.get("__epubjs_fragment")).toBe("chapter-2-target");
    expect(secondDraw.document.getElementById("chapter-2-root")).toBeTruthy();
    expect(
      secondDraw.document.getElementById("chapter-2-target")?.getBoundingClientRect().top ??
        Number.POSITIVE_INFINITY,
    ).toBeLessThan(8);
  });
});

describe("drawerRender", () => {
  it("renders the first spine item into paper", async () => {
    const root = createRoot();
    const reader = drawerRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;

    expect(root.firstElementChild).toBe(reader.iframe);
    expect(reader.paper.iframe).toBe(reader.iframe);
    expect(reader.iframe.contentDocument?.getElementById("chapter-1-root")).toBeTruthy();
    expect(reader.controller.getCurrent().html).toBe("chapter-1.xhtml");
    expect(reader.controller.getCurrent().position).toMatchObject({
      mode: "scroll",
    });
  });

  it("keeps the same paper iframe while switching spine items", async () => {
    const root = createRoot();
    const reader = drawerRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;
    const stableIframe = reader.iframe;

    await reader.loadSpine(1);

    expect(reader.controller.getCurrent().html).toBe("chapter-2.xhtml");
    expect(reader.iframe).toBe(stableIframe);
    expect(reader.iframe.contentDocument?.getElementById("chapter-2-root")).toBeTruthy();

    await reader.loadSpine(0);

    expect(reader.controller.getCurrent().html).toBe("chapter-1.xhtml");
    expect(reader.iframe).toBe(stableIframe);
    expect(reader.iframe.contentDocument?.getElementById("chapter-1-root")).toBeTruthy();
  });

  it("locates and reports positions in scroll mode by html plus element path", async () => {
    const root = createRoot();
    const reader = drawerRender(TEST_PREFIX, root, TEST_BOOK, { mode: "scroll" });
    readers.push(reader);

    await reader.ready;

    await reader.controller.setLocation({
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
    });

    const target = reader.iframe.contentDocument?.getElementById("chapter-2-target");
    expect(target).toBeTruthy();
    expect(target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY).toBeLessThan(8);
    expect(reader.controller.getCurrent()).toMatchObject({
      html: "chapter-2.xhtml",
      indexs: [1, 2, 1],
      position: {
        mode: "scroll",
      },
    });
  });

  it("moves through paginated paper before crossing spine boundaries", async () => {
    const root = createRoot();
    const reader = drawerRender(TEST_PREFIX, root, TEST_BOOK, { mode: "paginated" });
    readers.push(reader);

    await reader.ready;
    const stableIframe = reader.iframe;

    expect(reader.controller.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 0,
    });

    await reader.controller.next();

    expect(reader.getCurrentSpineIndex()).toBe(0);
    expect(reader.iframe).toBe(stableIframe);
    expect(reader.controller.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 1,
    });

    await reader.controller.next();

    expect(reader.getCurrentSpineIndex()).toBe(1);
    expect(reader.iframe).toBe(stableIframe);
    expect(reader.controller.getCurrent()).toMatchObject({
      html: "chapter-2.xhtml",
      position: {
        mode: "paginated",
        pageIndex: 0,
      },
    });

    await reader.controller.prev();

    expect(reader.getCurrentSpineIndex()).toBe(0);
    expect(reader.controller.getCurrent().position).toMatchObject({
      mode: "paginated",
      pageIndex: 1,
    });
  });

  it("keeps reader state in sync when clicking internal xhtml links inside the paper", async () => {
    const root = createRoot();
    const reader = drawerRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    await reader.ready;
    const stableIframe = reader.iframe;

    const link = reader.iframe.contentDocument?.getElementById("chapter-1-link");
    if (!link || !("click" in link) || typeof link.click !== "function") {
      throw new Error("Missing internal chapter link");
    }

    const nextRender = new Promise<void>((resolve) => {
      const unsubscribe = reader.onDocumentChange((event) => {
        if (event.href !== "chapter-2.xhtml") {
          return;
        }
        unsubscribe();
        resolve();
      });
    });

    link.click();
    await nextRender;

    await waitForCondition(() => {
      const target = reader.iframe.contentDocument?.getElementById("chapter-2-target");
      return (target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY) < 8;
    });

    const target = reader.iframe.contentDocument?.getElementById("chapter-2-target");
    expect(reader.getCurrentSpineIndex()).toBe(1);
    expect(reader.controller.getCurrent().html).toBe("chapter-2.xhtml");
    expect(reader.iframe).toBe(stableIframe);
    expect(target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY).toBeLessThan(8);
  });

  it("emits document-change events with rendered document and current href", async () => {
    const root = createRoot();
    const reader = drawerRender(TEST_PREFIX, root, TEST_BOOK);
    readers.push(reader);

    const seen: DrawerDocumentChangeEvent[] = [];
    const unsubscribe = reader.onDocumentChange((event) => {
      seen.push(event);
    });

    await reader.ready;

    expect(seen).toHaveLength(1);
    expect(seen[0]?.href).toBe("chapter-1.xhtml");
    expect(seen[0]?.document.getElementById("chapter-1-root")).toBeTruthy();

    await reader.loadSpine(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.href).toBe("chapter-2.xhtml");
    expect(seen[1]?.document.getElementById("chapter-2-root")).toBeTruthy();

    unsubscribe();
    await reader.loadSpine(0);
    expect(seen).toHaveLength(2);
  });
});
