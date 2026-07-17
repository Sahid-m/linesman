"use client";

import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

import { useNetwork } from "@/components/app-providers";
import { getNetworkConfig } from "@/lib/network/config";
import { subscribeFreeTier } from "@/lib/txline/subscription";

type SetupState = "guest_created" | "subscribed" | "activated" | null;

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function TxlineSetup({
  authenticated,
  onReady,
  onBusy,
}: {
  authenticated: boolean;
  onReady: (ready: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { network } = useNetwork();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const walletAdapter = useWallet();
  const [state, setState] = useState<SetupState>(null);
  const [serviceLevelId, setServiceLevelId] = useState(1);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    fetch(`/api/txline/setup/status?network=${network}`)
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              state: SetupState;
              serviceLevelId?: number;
            })
          : null,
      )
      .then((status) => {
        setState(status?.state ?? null);
        if (status?.serviceLevelId) setServiceLevelId(status.serviceLevelId);
        onReady(status?.state === "activated");
      })
      .catch(() => undefined);
  }, [authenticated, network, onReady]);

  async function setup() {
    const testWallet = (
      window as unknown as {
        __TXLINE_TEST_WALLET__?: {
          signMessage: (message: Uint8Array) => Promise<Uint8Array>;
          subscribe?: () => Promise<string>;
        };
      }
    ).__TXLINE_TEST_WALLET__;
    const signer = testWallet?.signMessage ?? walletAdapter.signMessage;
    if (!signer) {
      setError("A compatible wallet with signMessage is required.");
      return;
    }
    setBusy(true);
    onBusy(true);
    setError(undefined);
    try {
      let current = state;
      if (!current) {
        const response = await fetch("/api/txline/setup/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ network }),
        });
        if (!response.ok) throw new Error("Could not create guest credential");
        current = "guest_created";
        setState(current);
      }

      let txSignature: string;
      if (current === "guest_created") {
        if (testWallet?.subscribe) {
          txSignature = await testWallet.subscribe();
        } else {
          if (!wallet) throw new Error("Connect a wallet first");
          txSignature = await subscribeFreeTier({
            network,
            serviceLevelId,
            connection,
            wallet,
          });
        }
      } else {
        const status = await fetch(
          `/api/txline/setup/status?network=${network}`,
        ).then((response) => response.json()) as { txSignature?: string };
        if (!status.txSignature) throw new Error("Subscription signature missing");
        txSignature = status.txSignature;
      }

      const messageResponse = await fetch(
        "/api/txline/setup/activation-message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ network, txSignature, serviceLevelId }),
        },
      );
      const messageResult = (await messageResponse.json()) as {
        message?: string;
        error?: string;
      };
      if (!messageResponse.ok || !messageResult.message) {
        throw new Error(messageResult.error ?? "Activation message unavailable");
      }
      setState("subscribed");
      const walletSignature = base64(
        await signer(new TextEncoder().encode(messageResult.message)),
      );
      const activation = await fetch("/api/txline/setup/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, walletSignature }),
      });
      if (!activation.ok) throw new Error("TxLINE activation failed");
      setState("activated");
      onReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup failed");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <section className="feature-card" aria-labelledby="setup-title">
      <h2 id="setup-title">TxLINE setup</h2>
      <ol className="setup-steps">
        <li data-complete={state !== null}>Guest credential</li>
        <li data-complete={state === "subscribed" || state === "activated"}>
          On-chain subscription
        </li>
        <li data-complete={state === "activated"}>Activation signature</li>
        <li data-complete={state === "activated"}>Ready</li>
      </ol>
      {network === "mainnet" && (
        <label>
          Service level
          <select
            disabled={busy || state !== null}
            value={serviceLevelId}
            onChange={(event) => setServiceLevelId(Number(event.target.value))}
          >
            {getNetworkConfig(network).serviceLevels.map((level) => (
              <option value={level} key={level}>{level}</option>
            ))}
          </select>
        </label>
      )}
      {state === "activated" ? (
        <p className="success">TxLINE ready</p>
      ) : (
        <button disabled={!authenticated || busy} onClick={setup}>
          {busy ? "Setting up…" : "Set up TxLINE"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
