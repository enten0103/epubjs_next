import type { FileProvider } from "./index.ts";

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

export type EpubServerOptions = {
  /**
   * URL path prefix the Service Worker will intercept.
   * Requests to `<prefix>/<epubPath>` will be resolved via the provider.
   * A trailing `/` is added automatically if missing.
   */
  prefix: string;

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
};

export type EpubServer = {
  /** The normalised prefix this server intercepts. */
  readonly prefix: string;
  /** Unregister the message handler and remove the prefix from the SW. */
  dispose(): Promise<void>;
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Wait until the given ServiceWorker reaches the `activated` state.
 */
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

/**
 * Ensure a single SW registration is reused across multiple
 * `createEpubServer` calls within the same page.
 */
let cachedRegistration: ServiceWorkerRegistration | null = null;

/** @internal Reset cached registration (for tests only). */
export function _resetCachedRegistration(): void {
  cachedRegistration = null;
}

async function ensureServiceWorker(
  swUrl?: string,
  scope?: string,
): Promise<ServiceWorkerRegistration> {
  if (cachedRegistration?.active) return cachedRegistration;

  let registration: ServiceWorkerRegistration;

  if (swUrl) {
    // Explicit mode: register the SW ourselves
    registration = await navigator.serviceWorker.register(swUrl, {
      scope: scope ?? "/",
    });

    const sw = registration.installing ?? registration.waiting ?? registration.active;
    if (!sw) throw new Error("Service Worker installation failed");

    await waitForActivation(sw);
  } else {
    // Plugin mode: SW was already registered via the Vite plugin's
    // transformIndexHtml injection — just wait for it to be ready.
    registration = await navigator.serviceWorker.ready;
  }

  cachedRegistration = registration;
  return registration;
}

// ── Main API ─────────────────────────────────────────────────────────

/**
 * Create a virtual file server backed by a Service Worker.
 *
 * Every HTTP request whose pathname starts with `prefix` will be
 * intercepted by the SW and fulfilled by calling `provider.getBolbByPath`
 * on the main thread.
 *
 * @example
 * ```ts
 * // With the Vite plugin (recommended) — no swUrl needed:
 * const server = await createEpubServer(myProvider, {
 *   prefix: '/epub-abc123/',
 * });
 *
 * // Without the Vite plugin — provide swUrl explicitly:
 * const server = await createEpubServer(myProvider, {
 *   prefix: '/epub-abc123/',
 *   swUrl:  '/epub-sw.js',
 * });
 *
 * // Now fetch('/epub-abc123/OEBPS/chapter1.xhtml')
 * // is served from provider.getBolbByPath('OEBPS/chapter1.xhtml')
 *
 * await server.dispose();
 * ```
 */
export async function createEpubServer(
  provider: FileProvider,
  options: EpubServerOptions,
): Promise<EpubServer> {
  if (!navigator.serviceWorker) {
    throw new Error("Service Workers are not supported in this browser");
  }

  const prefix = options.prefix.endsWith("/") ? options.prefix : `${options.prefix}/`;

  const registration = await ensureServiceWorker(options.swUrl, options.scope);

  // Tell the SW to start intercepting this prefix
  registration.active!.postMessage({
    type: "EPUB_SW_ADD_PREFIX",
    prefix,
  });

  // Bridge: SW asks for a file → we read it from the provider → send back
  const onMessage = async (event: MessageEvent) => {
    const data = event.data;
    if (data?.type !== "EPUB_SW_FETCH") return;
    if (data.prefix !== prefix) return; // not for this server instance

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
    async dispose() {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      registration.active?.postMessage({
        type: "EPUB_SW_REMOVE_PREFIX",
        prefix,
      });
    },
  };
}
