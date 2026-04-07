import { createParser, useQueryState } from "nuqs";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { localStorage } from "@calcom/lib/webstorage";

const STORAGE_KEY = "bookings-preferred-view";

export type BookingView = "list" | "calendar" | "salon";

const viewParser = createParser({
  parse: (value: string) => {
    if (value === "calendar") return "calendar";
    if (value === "list") return "list";
    if (value === "salon") return "salon";
    return "salon";
  },
  serialize: (value: BookingView) => value,
});

const createLocalStorageStore = () => {
  let listeners: Array<() => void> = [];

  const subscribe = (listener: () => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  };

  const getSnapshot = (): BookingView => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "list" || stored === "calendar" || stored === "salon") {
      return stored;
    }
    return "salon";
  };

  const getServerSnapshot = (): BookingView => "salon";

  const notify = () => listeners.forEach((l) => l());

  return { subscribe, getSnapshot, getServerSnapshot, notify };
};

const localStorageStore = createLocalStorageStore();

type UseBookingsViewOptions = {
  bookingsV3Enabled: boolean;
};

export function useBookingsView({ bookingsV3Enabled }: UseBookingsViewOptions) {
  const [_view, setView] = useQueryState("view", viewParser.withDefault("salon"));

  const isInitializedRef = useRef(false);

  const storedView = useSyncExternalStore(
    localStorageStore.subscribe,
    localStorageStore.getSnapshot,
    localStorageStore.getServerSnapshot
  );

  const view: BookingView = bookingsV3Enabled ? _view : "list";

  useEffect(() => {
    const urlHasViewParam =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("view");

    if (!urlHasViewParam && storedView !== "salon" && _view !== storedView) {
      setView(storedView);
    } else {
      isInitializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isInitializedRef.current && _view === storedView) {
      isInitializedRef.current = true;
    }
  }, [_view, storedView]);

  useEffect(() => {
    if (!isInitializedRef.current) return;
    if (bookingsV3Enabled && view && view !== storedView) {
      localStorage.setItem(STORAGE_KEY, view);
      localStorageStore.notify();
    }
  }, [view, storedView, bookingsV3Enabled]);

  return [view, setView] as const;
}
