import { createEventHook } from "../../event/index.ts";
import type { EventHook, EventListener } from "../../event/index.ts";

export type ScrollSpiltDocumentChangeEvent = {
  document: Document;
  href: string;
  spineIndex: number;
};

export type ScrollSpiltDocumentChangeListener = EventListener<ScrollSpiltDocumentChangeEvent>;

export type ScrollSpiltDocumentChangeHook = EventHook<ScrollSpiltDocumentChangeEvent>;

export type ScrollSpiltEvents = {
  onDocumentChange?: ScrollSpiltDocumentChangeListener;
};

export const createScrollSpiltDocumentChangeHook = (
  events?: ScrollSpiltEvents,
): ScrollSpiltDocumentChangeHook => {
  return createEventHook<ScrollSpiltDocumentChangeEvent>(
    events?.onDocumentChange ? [events.onDocumentChange] : [],
  );
};
