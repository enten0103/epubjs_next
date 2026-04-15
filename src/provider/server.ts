import type { FileProvider } from "./index.ts";
import {
  DEFAULT_EPUB_SW_PREFIX,
  getEpubSwRuntimeConfig,
  normalizeEpubSwPrefix,
} from "./runtime.ts";

// ── MIME type mapping for common EPUB resources ──────────────────────

const MIME_MAP: Record<string, string> = {
  xhtml: "application/xhtml+xml",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
  webm: "video/webm",
  ncx: "application/x-dtbncx+xml",
  opf: "application/oebps-package+xml",
  smil: "application/smil+xml",
};

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

// ── Public types ─────────────────────────────────────────────────────

export interface EpubServiceWorkerOptions {
  /**
   * URL pointing to the Service Worker script file (`epub-sw.js`).
   *
   * When using the Vite plugin (`epubServiceWorker()`), the SW is
   * registered automatically and this option can be omitted.
   *
   * For non-Vite setups, provide the URL so the library can register
   * the SW on your behalf.
   */
  swUrl?: string;

  /** ServiceWorker scope (defaults to `"/"`). */
  scope?: string;

  /** Intercept prefix used for EPUB resource requests. */
  prefix?: string;
}

export interface BookHandle {
  /** The logical book identifier used inside the intercept prefix. */
  readonly id: string;
  /** Unregister this book from the service worker. */
  dispose(): void;
}

export interface EpubServiceWorker {
  /** Shared intercept prefix reserved for EPUB resource requests. */
  readonly prefix: string;

  /**
   * Register a book provider under a logical book id.
   *
   * Requests to `<prefix>/<bookId>/<path>` will be intercepted by the SW and
   * fulfilled by calling `provider.getBolbByPath(path)` on the main thread.
   *
   * @returns A handle to unregister this specific book.
   * @throws If the book id is already registered.
   */
  addBook(provider: FileProvider, bookId: string): BookHandle;

  /**
   * Unregister the book served under the given id.
   * No-op if the book id is not registered.
   */
  removeBook(bookId: string): void;

  /**
   * Dispose the service worker manager: unregister all books and remove
   * the message listener.
   */
  dispose(): void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function waitForActivation(sw: ServiceWorker): Promise<void> {
  if (sw.state === "activated") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const handler = () => {
      if (sw.state === "activated") {
        sw.removeEventListener("statechange", handler);
        resolve();
      }
    };
    sw.addEventListener("statechange", handler);
  });
}

function normalizePrefix(prefix: string): string {
  return normalizeEpubSwPrefix(prefix);
}

function normalizeBookId(bookId: string): string {
  const normalized = (bookId ?? "").trim();
  if (!normalized) {
    throw new Error("Book id is required");
  }
  return normalized;
}

// ── Main API ─────────────────────────────────────────────────────────

/**
 * Create an EPUB service worker manager.
 *
 * Connects to (or registers) the service worker once, then lets you
 * register multiple books under a shared intercept prefix via `addBook`.
 *
 * @example
 * ```ts
 * // With the Vite plugin (recommended) — SW is already registered:
 * const sw = await createEpubServiceWorker();
 *
 * // Without the Vite plugin — provide swUrl explicitly:
 * const sw = await createEpubServiceWorker({ swUrl: '/epub-sw.js' });
 *
 * // Register multiple books
 * const book1 = sw.addBook(provider1, 'book-1');
 * const book2 = sw.addBook(provider2, 'book-2');
 *
 * // Unregister a single book
 * book1.dispose();
 * // or: sw.removeBook('book-2');
 *
 * // Dispose everything
 * sw.dispose();
 * ```
 */
export async function createEpubServiceWorker(
  options?: EpubServiceWorkerOptions,
): Promise<EpubServiceWorker> {
  if (!navigator.serviceWorker) {
    throw new Error("Service Workers are not supported in this browser");
  }

  const runtimeConfig = getEpubSwRuntimeConfig();
  const prefix = normalizePrefix(
    options?.prefix ?? runtimeConfig?.prefix ?? DEFAULT_EPUB_SW_PREFIX,
  );

  let registration: ServiceWorkerRegistration;

  if (options?.swUrl) {
    registration = await navigator.serviceWorker.register(options.swUrl, {
      scope: options.scope ?? "/",
    });
    const sw = registration.installing ?? registration.waiting ?? registration.active;
    if (!sw) throw new Error("Service Worker installation failed");
    await waitForActivation(sw);
  } else {
    // Plugin mode: SW was already registered via the Vite plugin's
    // transformIndexHtml injection — just wait for it to be ready.
    registration = await navigator.serviceWorker.ready;
  }

  registration.active?.postMessage({
    type: "EPUB_SW_ADD_PREFIX",
    prefix,
  });

  const books = new Map<string, FileProvider>();

  // Single message handler that routes to the correct book by id
  const onMessage = async (event: MessageEvent) => {
    const data = event.data;
    if (data?.type !== "EPUB_SW_FETCH") return;

    const bookId = data.bookId as string;
    const provider = books.get(bookId);
    if (!provider) return;

    const port = event.ports[0];
    if (!port) return;

    const epubPath = data.path as string;
    try {
      const body = await provider.getBolbByPath(epubPath);
      const contentType = guessMimeType(epubPath);
      port.postMessage({ body, contentType });
    } catch {
      port.postMessage({ error: `Not found: ${epubPath}` });
    }
  };

  navigator.serviceWorker.addEventListener("message", onMessage);

  return {
    prefix,

    addBook(provider: FileProvider, bookId: string): BookHandle {
      const normalized = normalizeBookId(bookId);

      if (books.has(normalized)) {
        throw new Error(`Book already registered: ${normalized}`);
      }

      books.set(normalized, provider);

      return {
        id: normalized,
        dispose() {
          if (!books.has(normalized)) return;
          books.delete(normalized);
        },
      };
    },

    removeBook(bookId: string): void {
      const normalized = normalizeBookId(bookId);
      if (!books.has(normalized)) return;
      books.delete(normalized);
    },

    dispose(): void {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      books.clear();
    },
  };
}
