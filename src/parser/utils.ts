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

  // Use URL for normalization (handles ../ etc.)
  const baseUrl = new URL(`http://epub.local/${base}`);
  const resolved = new URL(pathPart, baseUrl);
  const finalPath = resolved.pathname.replace(/^\//, "");

  return fragment != null && fragment !== "" ? `${finalPath}#${fragment}` : finalPath;
}
