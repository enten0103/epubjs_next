import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { FileProvider } from "../src/provider/index.ts";
import { _resetCachedRegistration, createEpubServer } from "../src/provider/server.ts";

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

describe("createEpubServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    _resetCachedRegistration();
  });

  it("throws when Service Worker API is unavailable", async () => {
    const provider = createMockProvider({});
    await withMockSWContainer(undefined, async () => {
      await expect(
        createEpubServer(provider, { prefix: "/epub/", swUrl: "/sw.js" }),
      ).rejects.toThrow("Service Workers are not supported");
    });
  });

  it("normalizes prefix to include trailing slash", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const server = await createEpubServer(provider, {
        prefix: "/epub-test", // no trailing slash
        swUrl: "/sw.js",
      });

      expect(server.prefix).toBe("/epub-test/");

      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_ADD_PREFIX",
        prefix: "/epub-test/",
      });
    });
  });

  it("dispose removes prefix and message listener", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const server = await createEpubServer(provider, {
        prefix: "/epub-abc/",
        swUrl: "/sw.js",
      });

      expect(swContainer.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));

      await server.dispose();

      expect(swContainer.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));

      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_REMOVE_PREFIX",
        prefix: "/epub-abc/",
      });
    });
  });

  it("message bridge forwards requests to provider and replies via port", async () => {
    const fileContent = encoder.encode("<html>hello</html>");
    const provider = createMockProvider({
      "OEBPS/chapter1.xhtml": fileContent,
    });

    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const prefix = "/epub-bridge/";
      await createEpubServer(provider, { prefix, swUrl: "/sw.js" });

      const handler = getMessageHandler();
      expect(handler).toBeDefined();

      // Use a real MessageChannel so the browser accepts the ports
      const channel = new MessageChannel();

      const fakeEvent = new MessageEvent("message", {
        data: { type: "EPUB_SW_FETCH", path: "OEBPS/chapter1.xhtml", prefix },
        ports: [channel.port2],
      });

      handler!(fakeEvent);

      // Wait for the reply on port1
      const reply = await new Promise<{ body: Uint8Array; contentType: string }>((resolve) => {
        channel.port1.onmessage = (e) => resolve(e.data);
      });

      expect(reply.contentType).toBe("application/xhtml+xml");
      expect(reply.body).toEqual(fileContent);
    });
  });

  it("message bridge replies with error for missing files", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      const prefix = "/epub-err/";
      await createEpubServer(provider, { prefix, swUrl: "/sw.js" });

      const channel = new MessageChannel();

      const fakeEvent = new MessageEvent("message", {
        data: { type: "EPUB_SW_FETCH", path: "nonexistent.xhtml", prefix },
        ports: [channel.port2],
      });

      getMessageHandler()!(fakeEvent);

      const reply = await new Promise<{ error: string }>((resolve) => {
        channel.port1.onmessage = (e) => resolve(e.data);
      });

      expect(reply.error).toBe("Not found: nonexistent.xhtml");
    });
  });

  it("ignores messages with non-matching prefix", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      await createEpubServer(provider, { prefix: "/epub-a/", swUrl: "/sw.js" });

      const channel = new MessageChannel();

      // Message with a DIFFERENT prefix — should be ignored
      const fakeEvent = new MessageEvent("message", {
        data: { type: "EPUB_SW_FETCH", path: "ch1.xhtml", prefix: "/epub-b/" },
        ports: [channel.port2],
      });

      getMessageHandler()!(fakeEvent);

      // Give it a moment; port1 should receive nothing
      const gotReply = await Promise.race([
        new Promise<boolean>((resolve) => {
          channel.port1.onmessage = () => resolve(true);
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);

      expect(gotReply).toBe(false);
    });
  });

  it("ignores non-EPUB_SW_FETCH messages", async () => {
    const provider = createMockProvider({});
    const { swContainer, getMessageHandler } = createMockSW();

    await withMockSWContainer(swContainer, async () => {
      await createEpubServer(provider, { prefix: "/epub-x/", swUrl: "/sw.js" });

      const fakeEvent = new MessageEvent("message", {
        data: { type: "SOMETHING_ELSE" },
      });

      expect(() => getMessageHandler()!(fakeEvent)).not.toThrow();
    });
  });

  it("works without swUrl (plugin mode) using navigator.serviceWorker.ready", async () => {
    const { activeSW, swContainer } = createMockSW();
    const provider = createMockProvider({});

    await withMockSWContainer(swContainer, async () => {
      const server = await createEpubServer(provider, {
        prefix: "/epub-plugin/",
      });

      // Should NOT have called register (SW already registered by plugin)
      expect(swContainer.register).not.toHaveBeenCalled();

      // Should still have sent ADD_PREFIX to the active SW
      expect(activeSW.postMessage).toHaveBeenCalledWith({
        type: "EPUB_SW_ADD_PREFIX",
        prefix: "/epub-plugin/",
      });

      expect(server.prefix).toBe("/epub-plugin/");
    });
  });
});
