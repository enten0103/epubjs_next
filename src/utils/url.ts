/**
 * Shared URL and prefix helpers used by the EPUB runtime, renderer, and
 * service-worker integration.
 *
 * These helpers intentionally focus on the library's two recurring needs:
 * 1. normalizing request prefixes such as `/epubjs-next/`
 * 2. converting EPUB-relative href values into browser-facing URLs
 *
 * Keeping the logic here ensures prefix rules, fragment handling, and
 * in-document navigation all stay consistent across the codebase.
 */

/**
 * Return the directory portion of an EPUB-internal path.
 *
 * The result always uses forward slashes and, when a directory exists, keeps a
 * trailing slash so it can be used as a stable base for relative resolution.
 */
export function dirname(epubPath: string): string {
  const normalized = (epubPath ?? "").replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) return "";
  return normalized.slice(0, idx + 1);
}

/**
 * Resolve an EPUB-relative href against an EPUB directory path.
 *
 * Unlike browser URL resolution, this helper returns the normalized EPUB path
 * without the synthetic host that is only used internally for path joining.
 * Fragment identifiers are preserved because they are part of reading
 * navigation, even though they are ignored for network fetches.
 */
export function resolveEpubPath(baseDir: string, href: string): string {
  const base = (baseDir ?? "").replace(/^\/+/, "");
  const h = (href ?? "").trim();
  const [pathPartRaw, fragment] = h.split("#", 2);
  const pathPart = pathPartRaw ?? "";

  const baseUrl = new URL(`http://epub.local/${base}`);
  const resolved = new URL(pathPart, baseUrl);
  const finalPath = resolved.pathname.replace(/^\//, "");

  return fragment != null && fragment !== "" ? `${finalPath}#${fragment}` : finalPath;
}

/**
 * Normalize a request prefix into the library's canonical form.
 *
 * The returned prefix always has a leading slash and a trailing slash so it can
 * be safely concatenated with book ids and relative resource paths. Blank input
 * is treated as "no prefix configured" and returns `null`.
 */
export function normalizeUrlPrefix(prefix?: string | null): string | null {
  const trimmed = prefix?.trim();
  if (!trimmed) {
    return null;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

/**
 * Normalize a request prefix, falling back to a known default when the caller
 * does not provide one.
 *
 * This is primarily used by the service-worker runtime where an empty user
 * value should fall back to the library default instead of being rejected.
 */
export function normalizeUrlPrefixOrDefault(
  prefix: string | null | undefined,
  fallback: string,
): string {
  const normalized = normalizeUrlPrefix(prefix);
  if (normalized) {
    return normalized;
  }

  const normalizedFallback = normalizeUrlPrefix(fallback);
  if (!normalizedFallback) {
    throw new Error("Fallback prefix is required");
  }
  return normalizedFallback;
}

/**
 * Build the intercept namespace for a single book under a shared prefix.
 *
 * Book ids are URI-encoded because they become part of the fetchable URL path.
 */
export function buildBookScopedPrefix(prefix: string, bookId: string): string {
  const normalizedPrefix = normalizeUrlPrefix(prefix);
  if (!normalizedPrefix) {
    throw new Error("Prefix is required");
  }
  return `${normalizedPrefix}${encodeURIComponent(bookId)}`;
}

/**
 * Remove the fragment portion from an href while keeping the path untouched.
 *
 * This is useful when comparing spine hrefs or when fetching a document, where
 * `chapter.xhtml` and `chapter.xhtml#section-1` refer to the same resource.
 */
export function stripHrefFragment(href: string): string {
  return href.split("#", 1)[0] ?? href;
}

/**
 * Read the fragment identifier from an href.
 *
 * Returns `null` when the href does not target an element inside the current
 * document.
 */
export function getHrefFragment(href: string): string | null {
  const fragment = href.split("#", 2)[1];
  return fragment && fragment.length > 0 ? fragment : null;
}

/**
 * Detect whether a link targets something outside the current EPUB document
 * space, such as `https:`, `mailto:`, or protocol-relative URLs.
 */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

/**
 * Resolve an anchor href clicked inside a rendered XHTML document.
 *
 * - External links return `null` so the browser can handle them normally.
 * - Fragment-only links stay within the current XHTML file.
 * - Relative links are resolved against the current document's directory.
 */
export function resolveDocumentNavigationHref(currentHref: string, rawHref: string): string | null {
  const trimmedHref = rawHref.trim();
  if (!trimmedHref || isExternalHref(trimmedHref)) {
    return null;
  }

  if (trimmedHref.startsWith("#")) {
    const currentPath = stripHrefFragment(currentHref);
    return trimmedHref.length > 1 ? `${currentPath}${trimmedHref}` : currentPath;
  }

  return resolveEpubPath(dirname(stripHrefFragment(currentHref)), trimmedHref);
}

/**
 * Resolve the browser URL that represents the logical root of a rendered book.
 *
 * The `baseUrl` parameter defaults to the current page so callers can build
 * absolute fetch URLs without caring whether the configured prefix is relative
 * or absolute.
 */
export function resolveBookRootUrl(prefix: string, baseUrl?: string | URL): URL {
  const normalizedPrefix = normalizeUrlPrefix(prefix);
  if (!normalizedPrefix) {
    throw new Error("Prefix is required");
  }
  return new URL(normalizedPrefix, baseUrl ?? window.location.href);
}

/**
 * Resolve a document or asset href to the absolute URL fetched by the browser.
 *
 * Fragment identifiers are removed because they do not participate in network
 * requests.
 */
export function resolveBookResourceUrl(
  prefix: string,
  href: string,
  baseUrl?: string | URL,
): string {
  const normalizedHref = stripHrefFragment(href).replace(/^\/+/, "");
  return new URL(normalizedHref, resolveBookRootUrl(prefix, baseUrl)).toString();
}
