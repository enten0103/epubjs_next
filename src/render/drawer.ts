import type { EpubBook } from "../parser/types.ts";
import { normalizeUrlPrefix, resolveBookResourceUrl, stripHrefFragment } from "../utils/url.ts";
import type { EpubLocation } from "./location.ts";
import { getCurrentLocation, renderLocation } from "./location.ts";
import type { Paper } from "./paper.ts";

const LOCATION_MODE_PARAM = "__epubjs_mode";
const LOCATION_SCROLL_PARAM = "__epubjs_scroll";
const LOCATION_PAGE_PARAM = "__epubjs_page";
const LOCATION_PATH_PARAM = "__epubjs_path";
const LOCATION_FRAGMENT_PARAM = "__epubjs_fragment";

export type DrawerRenderResult = {
  paper: Paper;
  iframe: HTMLIFrameElement;
  document: Document;
  href: string;
};

export type Drawer = (paper: Paper, location: EpubLocation) => Promise<DrawerRenderResult>;

const requireBookPrefix = (book: EpubBook): string => {
  const prefix = normalizeUrlPrefix(book.resources?.prefix);
  if (!prefix) {
    throw new Error("createDrawer requires book.resources.prefix");
  }
  return prefix;
};

const serializeIndexs = (indexs?: readonly number[]): string | null => {
  if (!indexs || indexs.length === 0) {
    return null;
  }
  return indexs.join(".");
};

const resolveLocationMode = (paper: Paper, location: EpubLocation) => {
  if (location.position?.mode) {
    return location.position.mode;
  }

  if (paper.document && paper.href) {
    return getCurrentLocation(paper).position?.mode ?? paper.mode;
  }

  return paper.mode;
};

const buildIframeSrc = (prefix: string, paper: Paper, location: EpubLocation): string => {
  const mode = resolveLocationMode(paper, location);
  const url = new URL(resolveBookResourceUrl(prefix, location.html));
  url.searchParams.set(LOCATION_MODE_PARAM, mode);

  const fragment = location.fragment?.trim();
  if (fragment) {
    url.searchParams.set(LOCATION_FRAGMENT_PARAM, fragment);
  }

  const path = serializeIndexs(location.indexs);
  if (path) {
    url.searchParams.set(LOCATION_PATH_PARAM, path);
  }

  if (mode === "paginated" && location.position?.mode === "paginated") {
    url.searchParams.set(
      LOCATION_PAGE_PARAM,
      String(
        location.position?.mode === "paginated"
          ? Math.max(0, Math.floor(location.position.pageIndex))
          : 0,
      ),
    );
  } else if (mode === "scroll" && location.position?.mode === "scroll") {
    url.searchParams.set(
      LOCATION_SCROLL_PARAM,
      String(
        location.position?.mode === "scroll"
          ? Math.max(0, Math.floor(location.position.scrollTop))
          : 0,
      ),
    );
  }

  return url.toString();
};

const shouldRerender = (paper: Paper, location: EpubLocation): boolean => {
  if (!paper.document || !paper.href) {
    return true;
  }

  if (paper.href !== stripHrefFragment(location.html)) {
    return true;
  }

  const current = getCurrentLocation(paper);
  return (current.position?.mode ?? paper.mode) !== resolveLocationMode(paper, location);
};

export const createDrawer = (book: EpubBook): Drawer => {
  const drawer: Drawer = async (paper, location) => {
    const prefix = requireBookPrefix(book);
    const normalizedHref = stripHrefFragment(location.html);
    const normalizedLocation: EpubLocation = {
      ...location,
      html: normalizedHref,
    };

    if (!shouldRerender(paper, normalizedLocation)) {
      await renderLocation(paper, normalizedLocation);
      return {
        paper,
        iframe: paper.iframe,
        document: paper.document!,
        href: normalizedHref,
      };
    }

    const renderResult = await paper.render(
      normalizedHref,
      buildIframeSrc(prefix, paper, normalizedLocation),
    );

    return {
      paper,
      iframe: paper.iframe,
      document: renderResult.document,
      href: normalizedHref,
    };
  };

  return drawer;
};
