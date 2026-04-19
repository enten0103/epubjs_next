import { createEventHook } from "../event/index.ts";
import type { EventHook, EventListener } from "../event/index.ts";

export type DrawerDocumentChangeEvent = {
  document: Document;
  href: string;
  spineIndex: number;
};

export type DrawerDocumentChangeListener = EventListener<DrawerDocumentChangeEvent>;

export type DrawerDocumentChangeHook = EventHook<DrawerDocumentChangeEvent>;

export type DrawerEvents = {
  onDocumentChange?: DrawerDocumentChangeListener;
};

export const createDrawerDocumentChangeHook = (events?: DrawerEvents): DrawerDocumentChangeHook => {
  return createEventHook<DrawerDocumentChangeEvent>(
    events?.onDocumentChange ? [events.onDocumentChange] : [],
  );
};
