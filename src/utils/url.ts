/**
 * Shared EPUB path helpers used by the parser and renderer.
 */

export function dirname(epubPath: string): string {
  const normalized = (epubPath ?? "").replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) return "";
  return normalized.slice(0, idx + 1);
}

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

export function stripHrefFragment(href: string): string {
  return href.split("#", 1)[0] ?? href;
}

export function getHrefFragment(href: string): string | null {
  const fragment = href.split("#", 2)[1];
  return fragment && fragment.length > 0 ? fragment : null;
}

export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

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
