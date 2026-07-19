"use client";

import { Suspense, type ReactNode } from "react";
import { usePhonePreviewActive } from "@/lib/hooks/use-phone-preview-active";

/**
 * Renders `children` only when the full-screen phone preview overlay is
 * NOT covering the screen. The overlay's own iframe loads this same route
 * with `?view=desktop`, so its copy of the layout renders normally — only
 * the outer, now-hidden page skips mounting chrome + data fetching (SWR
 * polling, replay clocks, etc. don't run twice).
 */
export function PhonePreviewGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <PhonePreviewGateInner>{children}</PhonePreviewGateInner>
    </Suspense>
  );
}

function PhonePreviewGateInner({ children }: { children: ReactNode }) {
  const active = usePhonePreviewActive();
  if (active) return null;
  return <>{children}</>;
}
