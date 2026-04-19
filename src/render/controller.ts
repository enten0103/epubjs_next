import type { EpubLocation } from "./location.ts";
import {
  createBoundaryLocation,
  getCurrentLocation,
  getNextPageLocation,
  getPrevPageLocation,
} from "./location.ts";
import type { DrawerReaderRenderContext } from "./render.ts";

export interface DrawerController {
  setLocation: (location: EpubLocation) => Promise<void>;
  getCurrent: () => EpubLocation;
  next: () => Promise<void>;
  prev: () => Promise<void>;
}

export const useDrawerController = (context: DrawerReaderRenderContext): DrawerController => ({
  async setLocation(location) {
    await context.loadLocation(location);
  },

  getCurrent() {
    return getCurrentLocation(context.paper);
  },

  async next() {
    const nextLocation = getNextPageLocation(getCurrentLocation(context.paper));
    if (nextLocation) {
      await context.loadLocation(nextLocation);
      return;
    }

    const nextIndex = context.getCurrentSpineIndex() + 1;
    if (nextIndex >= context.book.spine.length) {
      return;
    }

    await context.loadLocation(
      createBoundaryLocation(context.book.spine[nextIndex]!.href, context.paper.mode, "start"),
    );
  },

  async prev() {
    const prevLocation = getPrevPageLocation(getCurrentLocation(context.paper));
    if (prevLocation) {
      await context.loadLocation(prevLocation);
      return;
    }

    const prevIndex = context.getCurrentSpineIndex() - 1;
    if (prevIndex < 0) {
      return;
    }

    await context.loadLocation(
      createBoundaryLocation(context.book.spine[prevIndex]!.href, context.paper.mode, "end"),
    );
  },
});
