import type { Metadata } from "next";
import { ShowcaseStage } from "@/components/linesman/showcase-stage";

export const metadata: Metadata = {
  title: "Linesman — Showcase",
  description: "Linesman running live, framed for a big screen. Real TxLINE odds, real venue prices, on-chain proof.",
};

/**
 * Judge-facing presentation route: a cinematic phone frame with the LIVE,
 * fully interactive app inside it (same iframe trick as the phone preview
 * overlay), the
 * Disagreement dial + live ticker orbiting it, and rotating captions. Always
 * phone-framed — unlike the sidebar toggle, this route doesn't read from the
 * viewport store, it's a fixed presentation surface.
 */
export default function ShowcasePage() {
  return <ShowcaseStage />;
}
