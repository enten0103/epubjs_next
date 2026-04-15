import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { FileProvider } from "../src/provider/index.ts";
import { createEpubServiceWorker } from "../src/provider/server.ts";
import { EPUB_SW_RUNTIME_CONFIG_KEY } from "../src/provider/runtime.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function createMockProvider(files: Record<string, Uint8Array>): FileProvider {
  return {
    getTextByPath: async (path: string) => {
      const content = files[path];
      if (!content) throw new Error(`Not found: ${path}`);
      return new TextDecoder().decode(content);
    },
    getBolbByPath: async (path: string) => {
      const content = files[path];
      if (!content) throw new Error(`Not found: ${path}`);
      return content;
    },
  };
}

const encoder = new TextEncoder();

function createMockSW() {
  const activeSW = {
    state: "activated" as ServiceWorkerState,
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const registration = {
    installing: null,
    waiting: null,
    active: activeSW,
  };

  let capturedMessageHandler: ((event: MessageEvent) => void) | undefined;

  const swContainer = {
    register: vi.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
    addEventListener: vi.fn((event: string, handler: (event: MessageEvent) => void) => {
      if (event === "message") capturedMessageHandler = handler;
    }),
    removeEventListener: vi.fn(),
  };

  return {
    activeSW,
    registration,
    swContainer,
    getMessageHandler: () => capturedMessageHandler,
  };
}

async function withMockSWContainer(swContainer: unknown, fn: () => Promise<void>) {
  const original = navigator.serviceWorker;
  Object.defineProperty(navigator, "serviceWorker", {
    value: swContainer,
    configurable: true,
    writable: true,
  });
  try {
    return await fn();
  } finally {
    Object.defineProperty(navigator, "serviceWorker", {
      value: original,
      configurable: true,
      writable: true,
    });
  }
}

async function withRuntimeConfig(config: { prefix: string } | undefined, fn: () => Promise<void>) {
  const runtimeGlobal = globalThis as typeof globalThis & {
    [EPUB_SW_RUNTIME_CONFIG_KEY]?: unknown;
  };
  const original = runtimeGlobal[EPUB_SW_RUNTIME_CONFIG_KEY];
  if (config) {
    runtimeGlobal[EPUB_SW_RUNTIME_CONFIG_KEY] = config;
  } else {
    delete runtimeGlobal[EPUB_SW_RUNTIME_CONFIG_KEY];
  }

  try {
    return await fn();
  } finally {
    if (original === undefined) {
      delete runtimeGlobal[EPUB_SW_RUNTIME_CONFIG_KEY];
    } else {
      runtimeGlobal[EPUB_SW_RUNTIME_CONFIG_KEY] = original;
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createEpubServiceWorker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when Service Worker API is unavailable", async () => {
    await withMockSWContainer(undefined, async () => {
      await expect(createEpubServiceWorker({ swUrl: "/sw.js" })).rejects.toThrow(
        "Service Workers are not supported",
      );
    });
  });

  it("uses plugin/runtime prefix without calling register in plugin mode", async () => {
    const { activeSW, swContainer } = createMockSW();

    await withRuntimeConfig({ prefix: "/epub-plugin/" }, async () => {
      await withMockSWContainer(swContainer, async () => {
        const sw = await createEpubServiceWorker();

        expect(swContainer.register).not.toHaveBeenCalled();
        expect(sw.prefix).toBe("/epub-plugin/");
        expect(activeSW.postMessage).toHaveBeenCalledWith({
          type: "EPUB_SW_ADD_PREFIX",
          prefix: "/epub-plugin/",
        });

        sw.dispose();
      });
    });
  });

  it("registers the service worker manually and normalizes the intercept prefix", async () => {
    const { activeSW, swContainer } = createMockSW();

    await withRuntimeConfig(undefined, async () => {
      await withMockSWContainer(swContainer, async () => {
        const sw = await createEpubServiceWorker({ swUrl: "/sw.js", prefix: "epub-manual" });

        expect(swContainer.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
        expect(sw.prefix).toBe("/epub-manual/");
        expect(activeSW.postMessage).toHaveBeenCalledWith({
          type: "EPUB_SW_ADD_PREFIX",
          prefix: "/epub-manual/",
        });

        sw.dispose();
      });
    });
  });

  it("registers books by id and rejects duplicate ids", async () => {
    const { swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js", prefix: "/epub/" });
      const book = sw.addBook(provider, "book-1");

      expect(book.id).toBe("book-1");
      expect(() => sw.addBook(provider, "book-1")).toThrow("Book already registered: book-1");

      sw.dispose();
    });
  });

  it("removeBook and book.dispose unregister providers by book id", async () => {
    const { swContainer, getMessageHandler } = createMockSW();
    const provider1 = createMockProvider({ "Text/ch1.xhtml": encoder.encode("book1") });
    const provider2 = createMockProvider({ "Text/ch1.xhtml": encoder.encode("book2") });

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js", prefix: "/epub/" });
      const book1 = sw.addBook(provider1, "book-1");
      sw.addBook(provider2, "book-2");

      book1.dispose();

      const removedChannel = new MessageChannel();
      getMessageHandler()?.(
        new MessageEvent("message", {
          data: {
            type: "EPUB_SW_FETCH",
            path: "Text/ch1.xhtml",
            prefix: "/epub/",
            bookId: "book-1",
          },
          ports: [removedChannel.port2],
        }),
      );

      const removedReply = await Promise.race([
        new Promise<boolean>((resolve) => {
          removedChannel.port1.onmessage = () => resolve(true);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      expect(removedReply).toBe(false);

      sw.removeBook("book-2");

      const secondChannel = new MessageChannel();
      getMessageHandler()?.(
        new MessageEvent("message", {
          data: {
            type: "EPUB_SW_FETCH",
            path: "Text/ch1.xhtml",
            prefix: "/epub/",
            bookId: "book-2",
          },
          ports: [secondChannel.port2],
        }),
      );

      const secondReply = await Promise.race([
        new Promise<boolean>((resolve) => {
          secondChannel.port1.onmessage = () => resolve(true);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      expect(secondReply).toBe(false);

      sw.dispose();
    });
  });

  it("message bridge forwards requests to the correct provider by book id", async () => {
    const fileContent1 = encoder.encode("<html>book1</html>");
    const fileContent2 = encoder.encode("<html>book2</html>");
    const provider1 = createMockProvider({ "OEBPS/chapter1.xhtml": fileContent1 });
    const provider2 = createMockProvider({ "OEBPS/chapter1.xhtml": fileContent2 });
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js", prefix: "/epub/" });
      sw.addBook(provider1, "book-1");
      sw.addBook(provider2, "book-2");

      const channel1 = new MessageChannel();
      getMessageHandler()?.(
        new MessageEvent("message", {
          data: {
            type: "EPUB_SW_FETCH",
            path: "OEBPS/chapter1.xhtml",
            prefix: "/epub/",
            bookId: "book-1",
          },
          ports: [channel1.port2],
        }),
      );
      const reply1 = await new Promise<{ body: Uint8Array; contentType: string }>((resolve) => {
        channel1.port1.onmessage = (event) => resolve(event.data);
      });

      const channel2 = new MessageChannel();
      getMessageHandler()?.(
        new MessageEvent("message", {
          data: {
            type: "EPUB_SW_FETCH",
            path: "OEBPS/chapter1.xhtml",
            prefix: "/epub/",
            bookId: "book-2",
          },
          ports: [channel2.port2],
        }),
      );
      const reply2 = await new Promise<{ body: Uint8Array; contentType: string }>((resolve) => {
        channel2.port1.onmessage = (event) => resolve(event.data);
      });

      expect(reply1.body).toEqual(fileContent1);
      expect(reply2.body).toEqual(fileContent2);
      expect(reply1.contentType).toBe("application/xhtml+xml");
      expect(reply2.contentType).toBe("application/xhtml+xml");

      sw.dispose();
    });
  });

  it("replies with errors for missing files and ignores unknown book ids", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js", prefix: "/epub/" });
      sw.addBook(provider, "book-err");

      const missingChannel = new MessageChannel();
      getMessageHandler()?.(
        new MessageEvent("message", {
          data: {
            type: "EPUB_SW_FETCH",
            path: "missing.xhtml",
            prefix: "/epub/",
            bookId: "book-err",
          },
          ports: [missingChannel.port2],
        }),
      );
      const missingReply = await new Promise<{ error: string }>((resolve) => {
        missingChannel.port1.onmessage = (event) => resolve(event.data);
      });
      expect(missingReply.error).toBe("Not found: missing.xhtml");

      const unknownChannel = new MessageChannel();
      getMessageHandler()?.(
        new MessageEvent("message", {
          data: {
            type: "EPUB_SW_FETCH",
            path: "missing.xhtml",
            prefix: "/epub/",
            bookId: "book-unknown",
          },
          ports: [unknownChannel.port2],
        }),
      );
      const unknownReply = await Promise.race([
        new Promise<boolean>((resolve) => {
          unknownChannel.port1.onmessage = () => resolve(true);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      expect(unknownReply).toBe(false);

      sw.dispose();
    });
  });

  it("dispose removes the message listener and ignores unrelated messages", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js", prefix: "/epub/" });
      sw.addBook(provider, "book-x");

      expect(swContainer.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));

      const fakeEvent = new MessageEvent("message", {
        data: { type: "SOMETHING_ELSE" },
      });
      expect(() => getMessageHandler()?.(fakeEvent)).not.toThrow();

      sw.dispose();

      expect(swContainer.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));
    });
  });
});
