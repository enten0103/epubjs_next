import type { Paper, PaperRuntimeApi } from "./paper.ts";
import { getPaperRuntime, waitForPaperFrame } from "./paper.ts";

export type ScrollLocationPosition = {
  mode: "scroll";
  scrollTop: number;
  maxScrollTop: number;
  viewportHeight: number;
};

export type PaginatedLocationPosition = {
  mode: "paginated";
  pageIndex: number;
  pageCount: number;
};

export type EpubLocationPosition = ScrollLocationPosition | PaginatedLocationPosition;

export type PaperMode = EpubLocationPosition["mode"];

export type EpubLocation = {
  html: string;
  fragment?: string;
  // Omitted or empty indexs means "the document root", which is the same
  // navigation semantic as an explicit [0] root marker.
  indexs?: number[];
  position?: EpubLocationPosition;
};

const requirePaperHref = (paper: Paper): string => {
  if (!paper.href) {
    throw new Error("Paper is not ready yet");
  }
  return paper.href;
};

const requirePaperRuntime = (paper: Paper): PaperRuntimeApi => {
  if (!paper.document) {
    throw new Error("Paper is not ready yet");
  }
  return getPaperRuntime(paper);
};

export const getCurrentLocation = (paper: Paper): EpubLocation => {
  return requirePaperRuntime(paper).getCurrentLocation(requirePaperHref(paper));
};

export const renderLocation = async (paper: Paper, location: EpubLocation): Promise<void> => {
  const paperHref = requirePaperHref(paper);
  if (location.html !== paperHref) {
    throw new Error(`Paper is rendering ${paperHref}, not ${location.html}`);
  }

  requirePaperRuntime(paper).setLocation(location);
  await waitForPaperFrame(paper.iframe);
};

export const getNextPageLocation = (location: EpubLocation): EpubLocation | null => {
  if (!location.position) {
    return null;
  }

  if (location.position.mode === "paginated") {
    if (location.position.pageIndex >= location.position.pageCount - 1) {
      return null;
    }

    return {
      html: location.html,
      position: {
        ...location.position,
        pageIndex: location.position.pageIndex + 1,
      },
    };
  }

  if (location.position.scrollTop >= location.position.maxScrollTop - 1) {
    return null;
  }

  return {
    html: location.html,
    position: {
      ...location.position,
      scrollTop: Math.min(
        location.position.maxScrollTop,
        location.position.scrollTop + location.position.viewportHeight,
      ),
    },
  };
};

export const getPrevPageLocation = (location: EpubLocation): EpubLocation | null => {
  if (!location.position) {
    return null;
  }

  if (location.position.mode === "paginated") {
    if (location.position.pageIndex <= 0) {
      return null;
    }

    return {
      html: location.html,
      position: {
        ...location.position,
        pageIndex: location.position.pageIndex - 1,
      },
    };
  }

  if (location.position.scrollTop <= 1) {
    return null;
  }

  return {
    html: location.html,
    position: {
      ...location.position,
      scrollTop: Math.max(0, location.position.scrollTop - location.position.viewportHeight),
    },
  };
};

export const createBoundaryLocation = (
  html: string,
  mode: PaperMode,
  boundary: "start" | "end",
): EpubLocation => {
  if (mode === "paginated") {
    return {
      html,
      position: {
        mode,
        pageIndex: boundary === "start" ? 0 : Number.MAX_SAFE_INTEGER,
        pageCount: Number.MAX_SAFE_INTEGER,
      },
    };
  }

  return {
    html,
    position: {
      mode,
      scrollTop: boundary === "start" ? 0 : Number.MAX_SAFE_INTEGER,
      maxScrollTop: Number.MAX_SAFE_INTEGER,
      viewportHeight: 0,
    },
  };
};
