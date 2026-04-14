export type EventListener<TPayload> = (payload: TPayload) => void;

export type EventUnsubscribe = () => void;

export type EventHook<TPayload> = {
  on: (listener: EventListener<TPayload>) => EventUnsubscribe;
  emit: (payload: TPayload) => void;
};

export const createEventHook = <TPayload>(
  initialListeners: ReadonlyArray<EventListener<TPayload>> = [],
): EventHook<TPayload> => {
  const listeners = new Set<EventListener<TPayload>>(initialListeners);
  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(payload) {
      for (const listener of listeners) {
        listener(payload);
      }
    },
  };
};
