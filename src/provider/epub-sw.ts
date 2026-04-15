/**
 * EPUB Virtual File Server — Service Worker Script
 *
 * This is a self-contained Service Worker that intercepts fetch requests
 * matching registered prefixes and forwards them to the main thread,
 * where a FileProvider serves the actual content.
 *
 * Communication protocol (SW ↔ Main thread):
 *   Main → SW:  { type: 'EPUB_SW_ADD_PREFIX',    prefix: string }
 *   Main → SW:  { type: 'EPUB_SW_REMOVE_PREFIX', prefix: string }
 *   SW → Main:  { type: 'EPUB_SW_FETCH', path: string, prefix: string, bookId: string } + MessagePort
 *   Main → SW (via port): { body: Uint8Array, contentType: string } | { error: string }
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

/** prefix → clientId that registered it */
const prefixClients = new Map<string, string>();

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  const clientId = (event.source as Client | null)?.id;

  if (data.type === "EPUB_SW_ADD_PREFIX" && clientId) {
    prefixClients.set(data.prefix as string, clientId);
  } else if (data.type === "EPUB_SW_REMOVE_PREFIX") {
    prefixClients.delete(data.prefix as string);
  }
});

self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);

  let matchedPrefix: string | undefined;
  let targetClientId: string | undefined;

  for (const [prefix, clientId] of prefixClients) {
    if (url.pathname.startsWith(prefix)) {
      matchedPrefix = prefix;
      targetClientId = clientId;
      break;
    }
  }

  if (!matchedPrefix || !targetClientId) return;

  const relativePath = url.pathname.slice(matchedPrefix.length).replace(/^\/+/, "");
  const [bookIdPart, ...epubParts] = relativePath.split("/");
  if (!bookIdPart || epubParts.length === 0) {
    return;
  }

  const bookId = decodeURIComponent(bookIdPart);
  const epubPath = decodeURIComponent(epubParts.join("/"));
  event.respondWith(fetchFromClient(targetClientId, bookId, epubPath, matchedPrefix));
});

async function fetchFromClient(
  clientId: string,
  bookId: string,
  epubPath: string,
  prefix: string,
): Promise<Response> {
  let client = await self.clients.get(clientId);

  // If the owning client is gone, try any window client
  if (!client) {
    const all = await self.clients.matchAll({ type: "window" });
    client = all[0];
  }

  if (!client) {
    return new Response("No active client", { status: 503 });
  }

  return new Promise<Response>((resolve) => {
    const channel = new MessageChannel();

    const timer = setTimeout(() => {
      resolve(new Response("Gateway Timeout", { status: 504 }));
    }, 30_000);

    channel.port1.onmessage = (msg) => {
      clearTimeout(timer);
      const resp = msg.data;

      if (resp?.error) {
        resolve(new Response(resp.error, { status: 404, statusText: "Not Found" }));
        return;
      }

      const headers = new Headers();
      if (resp.contentType) {
        headers.set("Content-Type", resp.contentType);
      }
      resolve(new Response(resp.body, { status: 200, headers }));
    };

    client!.postMessage({ type: "EPUB_SW_FETCH", path: epubPath, prefix, bookId }, [channel.port2]);
  });
}
