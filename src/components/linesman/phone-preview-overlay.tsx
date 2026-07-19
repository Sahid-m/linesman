"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useViewportStore } from "@/lib/store/viewport-store";
import { usePhonePreviewActive } from "@/lib/hooks/use-phone-preview-active";

/**
 * Mounted once at the app root (see `client-providers.tsx`). In "phone"
 * mode this takes over the *entire* viewport with a fixed full-screen
 * overlay — not a panel living next to the desktop sidebar — showing the
 * current route inside a real 390x844 browsing context (an iframe, so
 * every responsive class resolves against a genuine mobile viewport).
 * Being full-screen means the desktop shell (sidebar, ticker, banners, tab
 * bar) underneath is fully hidden: no double chrome, nothing bleeding in
 * from the edges, and — because all hooks here are called unconditionally
 * on every render — no "rendered fewer hooks than expected" crash.
 */
export function PhonePreviewOverlay() {
  return (
    <Suspense fallback={null}>
      <PhonePreviewOverlayInner />
    </Suspense>
  );
}

function PhonePreviewOverlayInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setMode = useViewportStore((state) => state.setMode);
  const isPhone = usePhonePreviewActive();

  if (!isPhone) return null;

  const frameParams = new URLSearchParams(searchParams);
  frameParams.delete("view");
  const query = frameParams.toString();
  const src = query ? `${pathname}?${query}` : pathname;

  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-[#05070c] py-8">
      <button
        type="button"
        onClick={() => setMode("desktop")}
        className="min-h-11 rounded-full border border-[color:var(--color-border)] px-4 text-xs font-semibold text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-text)]"
      >
        ← Exit phone preview
      </button>
      <div
        className="relative overflow-hidden rounded-[2.75rem] border-[6px] border-[#1a1e27] bg-black shadow-2xl"
        style={{ width: 390, height: 844, maxHeight: "calc(100vh - 96px)" }}
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
