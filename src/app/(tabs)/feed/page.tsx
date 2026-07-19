"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { LayoutGroup } from "framer-motion";
import type { Edge } from "@/lib/types";
import type { SourceStatus } from "@/lib/sources/manager";
import { EdgeCard } from "@/components/linesman/edge-card";
import { EmptyState } from "@/components/linesman/empty-state";
import { FreshnessChip } from "@/components/linesman/freshness-chip";
import { FilterChips, type FeedFilter } from "@/components/linesman/filter-chips";
import { PullToRefresh } from "@/components/linesman/pull-to-refresh";
import { DisagreementDial } from "@/components/linesman/disagreement-dial";
import { computeDisagreementIndex } from "@/lib/engine/disagreement";
import { useReplayStore } from "@/lib/store/replay-store";
import { useVenueSimStore } from "@/lib/store/venue-sim-store";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function matchesFilter(edge: Edge, filter: FeedFilter): boolean {
  switch (filter) {
    case "final":
      return edge.sharp.fixtureId === "wc26-final";
    case "underpriced":
      return edge.direction === "underpriced";
    case "high_confidence":
      return edge.confidence === "high";
    default:
      return true;
  }
}

export default function FeedPage() {
  const atMs = useVenueSimStore((state) => state.atMs);
  const simLabel = useVenueSimStore((state) => state.label);
  const playing = useVenueSimStore((state) => state.playing);
  const hydrated = useVenueSimStore((state) => state.hydrated);
  const clearSim = useVenueSimStore((state) => state.clear);

  const edgesKey =
    !hydrated ? null : atMs != null ? `/api/edges?atMs=${atMs}` : "/api/edges";
  const { data, isLoading, mutate } = useSWR<{ edges: Edge[]; status: SourceStatus; generatedAt: number }>(
    edgesKey,
    fetcher,
    {
      // Key already changes every match-minute while playing.
      refreshInterval: playing ? 0 : atMs != null ? 2_000 : 15_000,
      keepPreviousData: true,
    },
  );
  const [filter, setFilter] = useState<FeedFilter>("all");
  const seenIds = useRef<Set<string>>(new Set());
  const [freshlySeen, setFreshlySeen] = useState<Set<string>>(new Set());

  const edges = useMemo(() => data?.edges ?? [], [data]);
  const disagreement = useMemo(() => computeDisagreementIndex(edges), [edges]);

  useEffect(() => {
    if (!data) return;
    const fresh = new Set<string>();
    for (const edge of data.edges) {
      const key = `${edge.outcomeId}:${edge.venue.venue}:${edge.sharp.packetTimestamp}`;
      if (!seenIds.current.has(key)) fresh.add(`${edge.outcomeId}:${edge.venue.venue}`);
      seenIds.current.add(key);
    }
    if (fresh.size === 0) return;
    const markFresh = setTimeout(() => setFreshlySeen(fresh), 0);
    const clearFresh = setTimeout(() => setFreshlySeen(new Set()), 900);
    return () => {
      clearTimeout(markFresh);
      clearTimeout(clearFresh);
    };
  }, [data]);

  const filtered = useMemo(() => edges.filter((edge) => matchesFilter(edge, filter)), [edges, filter]);
  const lastPacketAt = useMemo(
    () => data?.status.lastPacketAt ?? edges.reduce((max, edge) => Math.max(max, edge.sharp.packetTimestamp), 0),
    [data, edges],
  );

  const focus = data?.status.focusFixture;

  async function clearFocus() {
    clearSim();
    await fetch("/api/focus", { method: "DELETE" });
    useReplayStore.getState().setReplayMode(false);
    useReplayStore.getState().setPlaying(false);
    void mutate();
  }

  return (
    <PullToRefresh onRefresh={() => mutate()}>
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Edge Feed</p>
            <h1 className="font-display text-3xl leading-[0.95] text-[color:var(--color-text)] lg:text-5xl">
              {simLabel ?? focus?.label ?? "Mispriced right now"}
            </h1>
          </div>
          {lastPacketAt > 0 && (
            <div className="self-start sm:self-auto">
              <FreshnessChip lastPacketAt={lastPacketAt} mode={data?.status.mode} />
            </div>
          )}
        </div>

        {(focus || atMs != null) && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--color-accent) 40%, var(--color-border))",
              background: "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))",
              color: "var(--color-text)",
            }}
          >
            <span className="min-w-0 flex-1">
              {data?.status.detail ||
                (playing ? "Simulation running — prices update every match-minute" : "Focused from Replay")}
            </span>
            <button
              type="button"
              onClick={() => void clearFocus()}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: "var(--color-bg)", background: "var(--color-accent)" }}
            >
              Back to live
            </button>
          </div>
        )}

        {edges.length > 0 && <DisagreementDial score={disagreement} />}

        <FilterChips active={filter} onChange={setFilter} />

        {isLoading && edges.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div
                key={key}
                className="h-[210px] animate-pulse rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            lastScanAt={data?.generatedAt ?? 0}
            isGenuinelyLive={data?.status.mode === "live"}
            mappedMarkets={data?.status.mappedMarkets ?? 0}
            focusLabel={simLabel ?? focus?.label}
            detail={data?.status.detail}
          />
        ) : (
          <LayoutGroup>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {filtered.map((edge) => (
                <EdgeCard
                  key={`${edge.outcomeId}:${edge.venue.venue}`}
                  edge={edge}
                  isNew={freshlySeen.has(`${edge.outcomeId}:${edge.venue.venue}`)}
                />
              ))}
            </div>
          </LayoutGroup>
        )}
      </div>
    </PullToRefresh>
  );
}
