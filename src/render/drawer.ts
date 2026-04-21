import type { EpubBook } from "../parser/types.ts";
import type { FileProvider } from "../provider/index.ts";
import { stripHrefFragment } from "../utils/url.ts";
import type { BookBlobResourceRuntime } from "./blob-resource.ts";
import { createBookBlobResourceRuntime } from "./blob-resource.ts";
import type { EpubLocation } from "./location.ts";
import { getCurrentLocation, renderLocation } from "./location.ts";
import type { Paper } from "./paper.ts";

export type DrawerRenderResult = {
  paper: Paper;
  iframe: HTMLIFrameElement;
  document: Document;
  href: string;
};

export type Drawer = ((paper: Paper, location: EpubLocation) => Promise<DrawerRenderResult>) & {
  dispose: () => void;
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

const ensureLocationPosition = (paper: Paper, location: EpubLocation): EpubLocation => {
  if (location.position || location.fragment || (location.indexs && location.indexs.length > 0)) {
    return location;
  }

  const mode = resolveLocationMode(paper, location);
  return {
    ...location,
    position:
      mode === "paginated"
        ? {
            mode,
            pageIndex: 0,
            pageCount: 1,
          }
        : {
            mode,
            scrollTop: 0,
            maxScrollTop: 0,
            viewportHeight: 0,
          },
  };
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

export const createDrawer = (
  book: EpubBook,
  providerOrRuntime: FileProvider | BookBlobResourceRuntime,
): Drawer => {
  const runtime =
    "getBolbByPath" in providerOrRuntime
      ? createBookBlobResourceRuntime(book, providerOrRuntime)
      : providerOrRuntime;

  const drawer = (async (paper, location) => {
    const normalizedHref = stripHrefFragment(location.html);
    const normalizedLocation = ensureLocationPosition(paper, {
      ...location,
      html: normalizedHref,
    });

    if (!shouldRerender(paper, normalizedLocation)) {
      await renderLocation(paper, normalizedLocation);
      return {
        paper,
        iframe: paper.iframe,
        document: paper.document!,
        href: normalizedHref,
      };
    }

    await paper.setMode(resolveLocationMode(paper, normalizedLocation));
    const renderResult = await paper.render(
      normalizedHref,
      await runtime.getDocumentContent(normalizedHref),
    );
    await renderLocation(paper, normalizedLocation);

    return {
      paper,
      iframe: paper.iframe,
      document: renderResult.document,
      href: normalizedHref,
    };
  }) as Drawer;

  drawer.dispose = () => {
    runtime.dispose();
  };

  return drawer;
};
