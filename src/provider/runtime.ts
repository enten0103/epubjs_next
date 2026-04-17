import { buildBookScopedPrefix, normalizeUrlPrefixOrDefault } from "../utils/url.ts";

export const EPUB_SW_RUNTIME_CONFIG_KEY = "__EPUBJS_NEXT_SW__";

export const DEFAULT_EPUB_SW_PREFIX = "/epubjs-next/";

export type EpubSwRuntimeConfig = {
  prefix: string;
  scope?: string;
  swUrl?: string;
};

type EpubSwRuntimeGlobal = typeof globalThis & {
  [EPUB_SW_RUNTIME_CONFIG_KEY]?: unknown;
};

export function normalizeEpubSwPrefix(prefix: string): string {
  return normalizeUrlPrefixOrDefault(prefix, DEFAULT_EPUB_SW_PREFIX);
}

export function buildEpubBookPrefix(prefix: string, bookId: string): string {
  return buildBookScopedPrefix(prefix, bookId);
}

export function getEpubSwRuntimeConfig(): EpubSwRuntimeConfig | undefined {
  const runtimeValue = (globalThis as EpubSwRuntimeGlobal)[EPUB_SW_RUNTIME_CONFIG_KEY];
  if (!runtimeValue || typeof runtimeValue !== "object") {
    return undefined;
  }

  const prefix =
    "prefix" in runtimeValue && typeof runtimeValue.prefix === "string"
      ? normalizeEpubSwPrefix(runtimeValue.prefix)
      : undefined;

  if (!prefix) {
    return undefined;
  }

  const scope =
    "scope" in runtimeValue && typeof runtimeValue.scope === "string"
      ? runtimeValue.scope
      : undefined;
  const swUrl =
    "swUrl" in runtimeValue && typeof runtimeValue.swUrl === "string"
      ? runtimeValue.swUrl
      : undefined;

  return {
    prefix,
    scope,
    swUrl,
  };
}
