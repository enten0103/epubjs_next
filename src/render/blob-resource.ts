import type { EpubBook } from "../parser/types.ts";
import type { FileProvider } from "../provider/index.ts";
import { dirname, isExternalHref, resolveEpubPath, stripHrefFragment } from "../utils/url.ts";

const MIME_MAP: Record<string, string> = {
  avif: "image/avif",
  css: "text/css",
  gif: "image/gif",
  htm: "text/html",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "application/javascript",
  json: "application/json",
  mjs: "application/javascript",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ncx: "application/x-dtbncx+xml",
  ogg: "audio/ogg",
  opf: "application/oebps-package+xml",
  opus: "audio/opus",
  otf: "font/otf",
  png: "image/png",
  smil: "application/smil+xml",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml",
  xml: "application/xml",
};

const CSS_IMPORT_PATTERN = /@import\s+(?:url\(\s*)?(['"]?)([^'")\s]+)\1\s*\)?/g;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const RUNTIME_API_KEY = "__EPUBJS_NEXT_BLOB_RUNTIME__";

const guessMimeType = (path: string, mediaType?: string): string => {
  if (mediaType) {
    return mediaType;
  }

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
};

const isDocumentResource = (path: string, mediaType?: string): boolean => {
  const mimeType = guessMimeType(path, mediaType);
  return (
    mimeType === "application/xhtml+xml" ||
    mimeType === "text/html" ||
    mimeType === "application/xml"
  );
};

const isCssResource = (path: string, mediaType?: string): boolean => {
  return guessMimeType(path, mediaType) === "text/css";
};

const shouldRewriteAssetHref = (rawHref: string): boolean => {
  const trimmedHref = rawHref.trim();
  return trimmedHref.length > 0 && !trimmedHref.startsWith("#") && !isExternalHref(trimmedHref);
};

const replaceAsync = async (
  input: string,
  pattern: RegExp,
  replacer: (...args: string[]) => Promise<string>,
): Promise<string> => {
  const matches = Array.from(input.matchAll(pattern));
  if (matches.length === 0) {
    return input;
  }

  const replacements = await Promise.all(
    matches.map((match) => replacer(...(match as unknown as string[]))),
  );

  let result = "";
  let lastIndex = 0;
  for (const [index, match] of matches.entries()) {
    const matchIndex = match.index ?? 0;
    result += input.slice(lastIndex, matchIndex);
    result += replacements[index] ?? match[0];
    lastIndex = matchIndex + match[0].length;
  }
  result += input.slice(lastIndex);
  return result;
};

const isRecoverableAssetError = (error: unknown): error is Error => {
  return (
    error instanceof Error &&
    (error.message.startsWith("File not found in EPUB archive:") ||
      error.message.startsWith("Ambiguous EPUB archive path:"))
  );
};

export type BookBlobResourceRuntime = {
  getDocumentContent: (href: string) => Promise<string>;
  dispose: () => void;
};

const buildRuntimeScript = (currentHref: string, resourceMap: Record<string, string>): string => {
  return `;(()=>{const currentHref=${JSON.stringify(currentHref)};const resourceMap=${JSON.stringify(resourceMap)};const apiKey=${JSON.stringify(RUNTIME_API_KEY)};const dirname=(value)=>{const normalized=(value??"").replace(/\\\\/g,"/");const idx=normalized.lastIndexOf("/");return idx===-1?"":normalized.slice(0,idx+1);};const resolveEpubPath=(baseDir,href)=>{const base=(baseDir??"").replace(/^\\/+/, "");const h=(href??"").trim();const [pathPartRaw,fragment]=h.split("#",2);const pathPart=pathPartRaw??"";const baseUrl=new URL(\`http://epub.local/\${base}\`);const resolved=new URL(pathPart,baseUrl);const finalPath=resolved.pathname.replace(/^\\//,"");return fragment!=null&&fragment!==""?\`\${finalPath}#\${fragment}\`:finalPath;};const stripHrefFragment=(href)=>href.split("#",1)[0]??href;const isExternalHref=(href)=>/^[a-z][a-z0-9+.-]*:/i.test(href)||href.startsWith("//");const resolveRuntimeUrl=(rawHref,baseHref=currentHref)=>{const trimmed=(rawHref??"").trim();if(!trimmed||trimmed.startsWith("#")||isExternalHref(trimmed)){return rawHref;}const resolved=resolveEpubPath(dirname(stripHrefFragment(baseHref)),trimmed);return resourceMap[stripHrefFragment(resolved)]??rawHref;};const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(typeof input==="string"||input instanceof URL){return originalFetch(resolveRuntimeUrl(String(input)),init);}return originalFetch(input,init);};if(typeof XMLHttpRequest!=="undefined"){const originalOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...rest){return originalOpen.call(this,method,resolveRuntimeUrl(String(url)),...rest);};}const originalSetAttribute=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){if(typeof value==="string"&&(name==="src"||name==="href"||name==="poster"||name==="data"||name==="xlink:href")&&this.localName!=="a"&&this.localName!=="area"){return originalSetAttribute.call(this,name,resolveRuntimeUrl(value));}return originalSetAttribute.call(this,name,value);};window[apiKey]={resolveRuntimeUrl};})();\n//# sourceURL=epubjs-next-blob-runtime.js`;
};

export const createBookBlobResourceRuntime = (
  book: EpubBook,
  provider: FileProvider,
): BookBlobResourceRuntime => {
  const mediaTypeByPath = new Map<string, string>();
  for (const item of book.manifest.values()) {
    if (item.mediaType) {
      mediaTypeByPath.set(stripHrefFragment(item.href), item.mediaType);
    }
  }

  const knownAssetPaths = new Set<string>();
  for (const item of book.manifest.values()) {
    const path = stripHrefFragment(item.href);
    if (!isDocumentResource(path, item.mediaType)) {
      knownAssetPaths.add(path);
    }
  }

  const createdUrls = new Set<string>();
  const resourceUrlCache = new Map<string, Promise<string>>();
  const documentContentCache = new Map<string, Promise<string>>();
  let assetMapPromise: Promise<Record<string, string>> | undefined;

  const resolveResourcePath = (baseHref: string, rawHref: string): string | null => {
    if (!shouldRewriteAssetHref(rawHref)) {
      return null;
    }

    return stripHrefFragment(resolveEpubPath(dirname(baseHref), rawHref));
  };

  const createBlobUrl = (parts: BlobPart[], type: string): string => {
    const url = URL.createObjectURL(new Blob(parts, { type }));
    createdUrls.add(url);
    return url;
  };

  const resolveAssetUrl = async (
    resolvedPath: string,
    fromPath: string,
    rawHref: string,
  ): Promise<string | null> => {
    try {
      return await ensureResourceUrl(resolvedPath);
    } catch (error) {
      if (!isRecoverableAssetError(error)) {
        throw error;
      }

      console.warn(
        `[epubjs-next] Failed to resolve asset "${rawHref}" from "${fromPath}" -> "${resolvedPath}": ${error.message}`,
      );
      return null;
    }
  };

  const rewriteCssText = async (cssText: string, fromPath: string): Promise<string> => {
    const rewriteReference = async (rawHref: string): Promise<string | null> => {
      const resolvedPath = resolveResourcePath(fromPath, rawHref);
      return resolvedPath ? resolveAssetUrl(resolvedPath, fromPath, rawHref) : null;
    };

    const withImports = await replaceAsync(
      cssText,
      CSS_IMPORT_PATTERN,
      async (match, quote, href) => {
        const nextUrl = await rewriteReference(href);
        return nextUrl ? `@import url("${nextUrl}")` : match;
      },
    );

    return replaceAsync(withImports, CSS_URL_PATTERN, async (match, quote, href) => {
      const nextUrl = await rewriteReference(href);
      return nextUrl ? `url("${nextUrl}")` : match;
    });
  };

  const getKnownAssetUrlMap = async (): Promise<Record<string, string>> => {
    if (assetMapPromise) {
      return assetMapPromise;
    }

    assetMapPromise = (async () => {
      const entries = (
        await Promise.all(
          Array.from(knownAssetPaths).map(async (path) => {
            const nextUrl = await resolveAssetUrl(path, path, path);
            return nextUrl ? ([path, nextUrl] as const) : null;
          }),
        )
      ).filter((entry): entry is readonly [string, string] => entry !== null);
      return Object.fromEntries(entries);
    })();

    return assetMapPromise;
  };

  const rewriteDocumentText = async (rawDocument: string, href: string): Promise<string> => {
    const doc = new DOMParser().parseFromString(rawDocument, "text/html");
    const rewriteUrlAttribute = async (element: Element, attributeName: string) => {
      const rawValue = element.getAttribute(attributeName);
      if (!rawValue) {
        return;
      }

      const resolvedPath = resolveResourcePath(href, rawValue);
      if (!resolvedPath) {
        return;
      }

      const nextUrl = await resolveAssetUrl(resolvedPath, href, rawValue);
      if (nextUrl) {
        element.setAttribute(attributeName, nextUrl);
      }
    };

    const elementPromises: Array<Promise<void>> = [];
    for (const element of Array.from(doc.querySelectorAll("*"))) {
      if (element.hasAttribute("style")) {
        const styleValue = element.getAttribute("style");
        if (styleValue) {
          elementPromises.push(
            rewriteCssText(styleValue, href).then((rewritten) => {
              element.setAttribute("style", rewritten);
            }),
          );
        }
      }

      if (element.hasAttribute("src")) {
        elementPromises.push(rewriteUrlAttribute(element, "src"));
      }
      if (element.hasAttribute("poster")) {
        elementPromises.push(rewriteUrlAttribute(element, "poster"));
      }
      if (element.hasAttribute("data")) {
        elementPromises.push(rewriteUrlAttribute(element, "data"));
      }
      if (
        element.hasAttribute("xlink:href") &&
        element.localName !== "a" &&
        element.localName !== "area"
      ) {
        elementPromises.push(rewriteUrlAttribute(element, "xlink:href"));
      }
      if (
        element.hasAttribute("href") &&
        element.localName !== "a" &&
        element.localName !== "area"
      ) {
        elementPromises.push(rewriteUrlAttribute(element, "href"));
      }
    }

    for (const styleElement of Array.from(doc.querySelectorAll("style"))) {
      const styleText = styleElement.textContent ?? "";
      elementPromises.push(
        rewriteCssText(styleText, href).then((rewritten) => {
          styleElement.textContent = rewritten;
        }),
      );
    }

    await Promise.all(elementPromises);

    const assetMap = await getKnownAssetUrlMap();
    const runtimeScript = doc.createElement("script");
    runtimeScript.type = "text/javascript";
    runtimeScript.textContent = buildRuntimeScript(href, assetMap);
    (doc.head ?? doc.documentElement).prepend(runtimeScript);

    const doctype = rawDocument.match(/<!DOCTYPE[^>]*>/i)?.[0] ?? "<!DOCTYPE html>";
    return `${doctype}${doc.documentElement.outerHTML}`;
  };

  const ensureResourceUrl = async (path: string): Promise<string> => {
    const normalizedPath = stripHrefFragment(path);
    const existing = resourceUrlCache.get(normalizedPath);
    if (existing) {
      return existing;
    }

    const next = (async () => {
      const mediaType = mediaTypeByPath.get(normalizedPath);
      if (isCssResource(normalizedPath, mediaType)) {
        const cssText = await provider.getTextByPath(normalizedPath);
        const rewrittenCss = await rewriteCssText(cssText, normalizedPath);
        return createBlobUrl([rewrittenCss], guessMimeType(normalizedPath, mediaType));
      }

      const body = await provider.getBolbByPath(normalizedPath);
      const exactBuffer = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer;
      return createBlobUrl([exactBuffer], guessMimeType(normalizedPath, mediaType));
    })();

    resourceUrlCache.set(normalizedPath, next);
    return next;
  };

  return {
    getDocumentContent(href) {
      const normalizedHref = stripHrefFragment(href);
      if (!isDocumentResource(normalizedHref, mediaTypeByPath.get(normalizedHref))) {
        throw new Error(`Not an XHTML document: ${href}`);
      }
      const cached = documentContentCache.get(normalizedHref);
      if (cached) {
        return cached;
      }

      const next = provider
        .getTextByPath(normalizedHref)
        .then((rawDocument) => rewriteDocumentText(rawDocument, normalizedHref));
      documentContentCache.set(normalizedHref, next);
      return next;
    },
    dispose() {
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
      createdUrls.clear();
      documentContentCache.clear();
      resourceUrlCache.clear();
      assetMapPromise = undefined;
    },
  };
};
