import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Find `epub-sw.ts` whether running from `src/` (dev) or `dist/` (packed). */
function findSwSource(): string {
  const candidates = [
    resolve(__dirname, "provider/epub-sw.ts"),
    resolve(__dirname, "../src/provider/epub-sw.ts"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "[vite-plugin-epub-sw] Cannot locate epub-sw.ts. " + `Searched: ${candidates.join(", ")}`,
  );
}

export interface EpubSwPluginOptions {
  /** Output filename for the service worker. Default: `'epub-sw.js'` */
  filename?: string;
  /** ServiceWorker scope. Default: `'/'` */
  scope?: string;
}

let cachedSwJs: string | undefined;

/**
 * Compile `epub-sw.ts` to plain JavaScript using Vite's built-in
 * OXC transformer (Vite 8+) with a fallback to esbuild (Vite 5-7).
 */
async function compileSw(): Promise<string> {
  if (cachedSwJs) return cachedSwJs;

  const swPath = findSwSource();
  const tsSource = readFileSync(swPath, "utf-8");

  const vite: Record<string, any> = await import("vite-plus");
  const transformFn = vite["transformWithOxc"] ?? vite["transformWithEsbuild"];
  if (!transformFn) {
    throw new Error(
      "[vite-plugin-epub-sw] No TypeScript transform found. " + "Please use Vite 5+ or vite-plus.",
    );
  }

  const result = await transformFn(tsSource, swPath);
  cachedSwJs = result.code as string;
  return cachedSwJs;
}

/**
 * Vite plugin that serves the EPUB Service Worker and auto-registers it.
 *
 * - **Dev**: serves the compiled SW at `/<filename>` via middleware.
 * - **Build**: emits the compiled SW as a separate asset.
 * - **HTML**: injects a `<script>` into `index.html` that calls
 *   `navigator.serviceWorker.register()` so the SW is ready before any
 *   application code runs.
 *
 * With this plugin, `createEpubServiceWorker()` no longer requires a `swUrl`
 * option — the SW is already registered by the time user code executes.
 */
export function epubServiceWorker(options: EpubSwPluginOptions = {}) {
  const filename = options.filename ?? "epub-sw.js";
  const scope = options.scope ?? "/";
  const swDevPath = `/${filename}`;
  let basePath = "/";

  return {
    name: "vite-plugin-epub-sw",

    configResolved(config: { base?: string }) {
      basePath = config.base ?? "/";
    },

    transformIndexHtml() {
      const swUrl =
        basePath === "/" || basePath.endsWith("/")
          ? `${basePath}${filename}`
          : `${basePath}/${filename}`;

      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: `if("serviceWorker"in navigator){navigator.serviceWorker.register(${JSON.stringify(swUrl)},{scope:${JSON.stringify(scope)}})}`,
          injectTo: "head-prepend" as const,
        },
      ];
    },

    configureServer(server: {
      middlewares: {
        use(
          fn: (
            req: { url?: string },
            res: {
              setHeader(name: string, value: string): void;
              end(data: string): void;
            },
            next: (err?: unknown) => void,
          ) => void,
        ): void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== swDevPath) return next();
        void compileSw()
          .then((js) => {
            res.setHeader("Content-Type", "application/javascript");
            res.setHeader("Service-Worker-Allowed", "/");
            res.end(js);
          })
          .catch(next);
      });
    },

    async generateBundle(this: {
      emitFile(file: { type: string; fileName: string; source: string }): void;
    }) {
      const js = await compileSw();
      this.emitFile({
        type: "asset",
        fileName: filename,
        source: js,
      });
    },
  };
}
