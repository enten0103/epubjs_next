/**
 * Backward-compatible re-export for parser callers.
 *
 * URL and path helpers now live in `src/utils/url.ts` so the renderer,
 * provider runtime, and parser all share the same behavior from one place.
 */
export { dirname, resolveEpubPath } from "../utils/url.ts";
