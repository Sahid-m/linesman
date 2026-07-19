"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useViewportStore } from "@/lib/store/viewport-store";

/**
 * Renders `children` as-is in "desktop" mode. In "phone" mode, instead
 * shows the *same live route* inside a real 390x844 browsing context (an
 * iframe), so every `lg:`/`md:` responsive class resolves against a true
 * mobile viewport rather than a CSS trick — what's inside the frame is
 * exactly what a judge sees on their phone, fully interactive.
 *
 * `?view=desktop` on the iframe's own URL is what stops this from framing
 * itself infinitely (the store's persisted mode is shared across same-origin
 * iframes via localStorage); `?view=phone` lets any link force phone mode.
 */
export function ViewportFrame({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <ViewportFrameInner>{children}</ViewportFrameInner>
    </Suspense>
  );
}

function ViewportFrameInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeMode = useViewportStore((state) => state.mode);
  const setMode = useViewportStore((state) => state.setMode);

  const urlView = searchParams.get("view");
  if (urlView === "desktop") return <>{children}</>;

  const isPhone = urlView === "phone" || storeMode === "phone";
  if (!isPhone) return <>{children}</>;

  const frameParams = new URLSearchParams(searchParams);
  frameParams.set("view", "desktop");
  const src = `${pathname}?${frameParams.toString()}`;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 py-10">
      <button
        type="button"
        onClick={() => setMode("desktop")}
        className="min-h-11 rounded-full border border-[color:var(--color-border)] px-4 text-xs font-semibold text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-text)]"
      >
        ← Exit phone preview
      </button>
      <div
        className="relative overflow-hidden rounded-[2.75rem] border-[6px] border-[#1a1e27] bg-black shadow-2xl"
        style={{ width: 390, height: 844 }}
      >
        <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-[#1a1e27]" />
        <iframe
          key={src}
          src={src}
          title="Linesman — phone preview"
          className="h-full w-full border-0"
          style={{ colorScheme: "dark" }}
        />
      </div>
    </div>
  );
}
