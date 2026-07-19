import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewportMode = "desktop" | "phone";

interface ViewportState {
  mode: ViewportMode;
  setMode: (mode: ViewportMode) => void;
  toggle: () => void;
}

/**
 * Desktop/Phone preview toggle — lets a judge or teammate see the mobile
 * layout (the primary judged viewport) without shrinking the actual browser
 * window. Persisted so it survives a refresh; `?view=phone` in the URL can
 * still force it (see `phone-preview-overlay.tsx`) without touching this.
 */
export const useViewportStore = create<ViewportState>()(
  persist(
    (set, get) => ({
      mode: "desktop",
      setMode: (mode) => set({ mode }),
      toggle: () => set({ mode: get().mode === "desktop" ? "phone" : "desktop" }),
    }),
    { name: "linesman-viewport" },
  ),
);
