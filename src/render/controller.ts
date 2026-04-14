import type { EpubLocation } from "./location.ts";

export type Controller = {
  setLocation: (location: EpubLocation) => Promise<void>;
  getCurrent: () => EpubLocation;
};
