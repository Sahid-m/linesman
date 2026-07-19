"use client";

import { useSearchParams } from "next/navigation";
import { useViewportStore } from "@/lib/store/viewport-store";

/**
 * True when the full-screen phone preview overlay should own the screen.
 *
 * Two bugs the old `ViewportFrame` had, both fixed by centralizing this
 * check here and using it consistently:
 *
 * 1. "Rendered fewer hooks than expected" — `ViewportFrame` called
 *    `useState` *after* early-returning based on `isPhone`, so the hook
 *    count for that component instance changed between renders whenever
 *    the phone/desktop branch flipped (e.g. navigating while a stale
 *    `mode` was still being read). Hooks must never be conditional.
 * 2. Infinite nested frames — the iframe shares localStorage with the
 *    parent (same origin), so any in-app `<Link>` clicked *inside* the
 *    preview iframe (which doesn't carry the `?view=desktop` param along)
 *    would read the persisted "phone" mode straight back off localStorage
 *    and re-open the overlay recursively inside itself.
 *
 * `window.self !== window.top` sidesteps #2 entirely: any document running
 * inside *any* iframe never activates the overlay, no matter which URL
 * it's on. Must be called from within a Suspense boundary (useSearchParams
 * requirement) — use `PhonePreviewGate` if you just need to conditionally
 * render children.
 */
export function usePhonePreviewActive(): boolean {
  const storeMode = useViewportStore((state) => state.mode);
  const searchParams = useSearchParams();
  const urlView = searchParams.get("view");

  if (typeof window !== "undefined" && window.self !== window.top) return false;
  if (urlView === "desktop") return false;
  return urlView === "phone" || storeMode === "phone";
}
