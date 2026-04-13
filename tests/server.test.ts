import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { FileProvider } from "../src/provider/index.ts";
import { createEpubServiceWorker } from "../src/provider/server.ts";

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

  it("works without swUrl (plugin mode) using navigator.serviceWorker.ready", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker();
      const book = sw.addBook(provider, "/epub-plugin/");

      // Should NOT have called register (SW already registered by plugin)
      expect(swContainer.register).not.toHaveBeenCalled();

      // Should still have sent ADD_PREFIX to the active SW
      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_ADD_PREFIX",
        prefix: "/epub-plugin/",
      });

      expect(book.prefix).toBe("/epub-plugin/");
      sw.dispose();
    });
  });

  it("addBook normalizes prefix to include trailing slash", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      const book = sw.addBook(provider, "/epub-test"); // no trailing slash

      expect(book.prefix).toBe("/epub-test/");

      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_ADD_PREFIX",
        prefix: "/epub-test/",
      });

      sw.dispose();
    });
  });

  it("addBook throws on duplicate prefix", async () => {
    const { swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider, "/epub-dup/");

      expect(() => sw.addBook(provider, "/epub-dup/")).toThrow(
        "Prefix already registered: /epub-dup/",
      );

      sw.dispose();
    });
  });

  it("addBook supports multiple books with different prefixes", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider1 = createMockProvider({ "ch1.xhtml": encoder.encode("book1") });
    const provider2 = createMockProvider({ "ch1.xhtml": encoder.encode("book2") });

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      const book1 = sw.addBook(provider1, "/book-1/");
      const book2 = sw.addBook(provider2, "/book-2/");

      expect(book1.prefix).toBe("/book-1/");
      expect(book2.prefix).toBe("/book-2/");

      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_ADD_PREFIX",
        prefix: "/book-1/",
      });
      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_ADD_PREFIX",
        prefix: "/book-2/",
      });

      sw.dispose();
    });
  });

  it("book.dispose() removes only that book's prefix", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      const book1 = sw.addBook(provider, "/epub-a/");
      sw.addBook(provider, "/epub-b/");

      book1.dispose();

      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_REMOVE_PREFIX",
        prefix: "/epub-a/",
      });

      // Calling dispose again is a no-op (no double-remove)
      activeSW.postMessage.mockClear();
      book1.dispose();
      expect(activeSW.postMessage).not.toHaveBeenCalled();

      sw.dispose();
    });
  });

  it("removeBook removes prefix by name", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider, "/epub-rm/");

      sw.removeBook("/epub-rm/");

      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_REMOVE_PREFIX",
        prefix: "/epub-rm/",
      });

      // removeBook on non-existent prefix is a no-op
      activeSW.postMessage.mockClear();
      sw.removeBook("/epub-rm/");
      expect(activeSW.postMessage).not.toHaveBeenCalled();

      sw.dispose();
    });
  });

  it("dispose removes all books and message listener", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider, "/epub-a/");
      sw.addBook(provider, "/epub-b/");

      expect(swContainer.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));

      activeSW.postMessage.mockClear();
      sw.dispose();

      expect(swContainer.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));

      // Both prefixes should have been removed
      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_REMOVE_PREFIX",
        prefix: "/epub-a/",
      });
      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_REMOVE_PREFIX",
        prefix: "/epub-b/",
      });
    });
  });

  it("message bridge forwards requests to the correct provider by prefix", async () => {
    const fileContent1 = encoder.encode("<html>book1</html>");
    const fileContent2 = encoder.encode("<html>book2</html>");
    const provider1 = createMockProvider({ "OEBPS/chapter1.xhtml": fileContent1 });
    const provider2 = createMockProvider({ "OEBPS/chapter1.xhtml": fileContent2 });

    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider1, "/book-1/");
      sw.addBook(provider2, "/book-2/");

      const handler = getMessageHandler();
      expect(handler).toBeDefined();

      // Request for book-1
      const channel1 = new MessageChannel();
      handler!(
        new MessageEvent("message", {
          data: { type: "EPUB_SW_FETCH", path: "OEBPS/chapter1.xhtml", prefix: "/book-1/" },
          ports: [channel1.port2],
        }),
      );
      const reply1 = await new Promise<{ body: Uint8Array; contentType: string }>((resolve) => {
        channel1.port1.onmessage = (e) => resolve(e.data);
      });
      expect(reply1.body).toEqual(fileContent1);

      // Request for book-2
      const channel2 = new MessageChannel();
      handler!(
        new MessageEvent("message", {
          data: { type: "EPUB_SW_FETCH", path: "OEBPS/chapter1.xhtml", prefix: "/book-2/" },
          ports: [channel2.port2],
        }),
      );
      const reply2 = await new Promise<{ body: Uint8Array; contentType: string }>((resolve) => {
        channel2.port1.onmessage = (e) => resolve(e.data);
      });
      expect(reply2.body).toEqual(fileContent2);

      expect(reply1.contentType).toBe("application/xhtml+xml");
      expect(reply2.contentType).toBe("application/xhtml+xml");

      sw.dispose();
    });
  });

  it("message bridge replies with error for missing files", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider, "/epub-err/");

      const channel = new MessageChannel();

      getMessageHandler()!(
        new MessageEvent("message", {
          data: { type: "EPUB_SW_FETCH", path: "nonexistent.xhtml", prefix: "/epub-err/" },
          ports: [channel.port2],
        }),
      );

      const reply = await new Promise<{ error: string }>((resolve) => {
        channel.port1.onmessage = (e) => resolve(e.data);
      });

      expect(reply.error).toBe("Not found: nonexistent.xhtml");

      sw.dispose();
    });
  });

  it("ignores messages with non-matching prefix", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider, "/epub-a/");

      const channel = new MessageChannel();

      // Message with a DIFFERENT prefix — should be ignored
      getMessageHandler()!(
        new MessageEvent("message", {
          data: { type: "EPUB_SW_FETCH", path: "ch1.xhtml", prefix: "/epub-b/" },
          ports: [channel.port2],
        }),
      );

      // Give it a moment; port1 should receive nothing
      const gotReply = await Promise.race([
        new Promise<boolean>((resolve) => {
          channel.port1.onmessage = () => resolve(true);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);

      expect(gotReply).toBe(false);

      sw.dispose();
    });
  });

  it("ignores non-EPUB_SW_FETCH messages", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const sw = await createEpubServiceWorker({ swUrl: "/sw.js" });
      sw.addBook(provider, "/epub-x/");

      const fakeEvent = new MessageEvent("message", {
        data: { type: "SOMETHING_ELSE" },
      });

      expect(() => getMessageHandler()!(fakeEvent)).not.toThrow();

      sw.dispose();
    });
  });
});
