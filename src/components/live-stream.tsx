"use client";

import { useEffect, useRef, useState } from "react";
import { useNetwork } from "@/components/app-providers";
import { SseStreamDecoder, type SseMessage } from "@/lib/txline/sse";
import { normalizeScoreEvent, type TxlineEvent } from "@/lib/txline/types";

type StreamState =
  | "connecting"
  | "live"
  | "idle"
  | "reconnecting"
  | "failed";

function StreamPanel({
  kind,
  fixtureId,
  onVerify,
}: {
  kind: "odds" | "scores";
  fixtureId: number;
  onVerify: (event: TxlineEvent) => void;
}) {
  const { network } = useNetwork();
  const [status, setStatus] = useState<StreamState>("connecting");
  const [events, setEvents] = useState<SseMessage[]>([]);
  const lastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const markIdleLater = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setStatus("idle"), 15_000);
    };
    const connect = async () => {
      setStatus(reconnectAttempt ? "reconnecting" : "connecting");
      try {
        const headers: HeadersInit = { Accept: "text/event-stream" };
        if (lastId.current) headers["Last-Event-ID"] = lastId.current;
        const response = await fetch(
          `/api/txline/stream/${kind}?network=${network}`,
          { headers, signal: controller.signal },
        );
        if (!response.ok || !response.body) throw new Error("Stream unavailable");
        setStatus("live");
        reconnectAttempt = 0;
        markIdleLater();
        const reader = response.body.getReader();
        const parser = new SseStreamDecoder();
        const consumeMessages = (messages: SseMessage[]) => {
          for (const message of messages) {
            if (message.id) lastId.current = message.id;
            setStatus("live");
            markIdleLater();
            setEvents((current) => [...current, message].slice(-250));
          }
        };
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            consumeMessages(parser.finish());
            break;
          }
          consumeMessages(parser.push(value));
        }
        if (!controller.signal.aborted) throw new Error("Stream ended");
      } catch {
        if (controller.signal.aborted) return;
        reconnectAttempt += 1;
        const delays = [1, 2, 4, 8, 15];
        const seconds = delays[Math.min(reconnectAttempt - 1, delays.length - 1)];
        setStatus(reconnectAttempt > 8 ? "failed" : "reconnecting");
        reconnectTimer = setTimeout(
          connect,
          seconds * 1_000 * (0.8 + Math.random() * 0.4),
        );
      }
    };
    void connect();
    return () => {
      controller.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [kind, network, fixtureId]);

  return (
    <article className="stream-panel">
      <h3>{kind === "scores" ? "Live scores" : "Live odds"}</h3>
      <p className={`stream-state stream-${status}`}>{status}</p>
      <ol>
        {events.slice(-10).map((event, index) => {
          let normalized: TxlineEvent | undefined;
          if (kind === "scores") {
            try {
              normalized = normalizeScoreEvent(JSON.parse(event.data), "live");
            } catch {
              normalized = undefined;
            }
          }
          return (
            <li key={`${event.id ?? "event"}-${index}`}>
              <code>{event.data}</code>
              {normalized?.fixtureId === fixtureId &&
                normalized.seq !== undefined && (
                  <button onClick={() => onVerify(normalized!)}>Verify</button>
                )}
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function LiveStream({
  fixtureId,
  onVerify,
}: {
  fixtureId: number | null;
  onVerify: (event: TxlineEvent) => void;
}) {
  if (!fixtureId) {
    return (
      <section className="feature-card">
        <h2>Live streams</h2>
        <p>Select a fixture first.</p>
      </section>
    );
  }
  return (
    <section className="feature-card stream-grid">
      <StreamPanel kind="odds" fixtureId={fixtureId} onVerify={onVerify} />
      <StreamPanel kind="scores" fixtureId={fixtureId} onVerify={onVerify} />
    </section>
  );
}
