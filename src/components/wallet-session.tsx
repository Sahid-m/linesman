"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useNetwork } from "@/components/app-providers";

type Session = { userId: string; walletPublicKey: string };

type TestWallet = {
  publicKey: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

type Balance = { identity: string; sol: number };

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

declare global {
  interface Window {
    __TXLINE_TEST_WALLET__?: TestWallet;
  }
}

export function WalletSession({
  onSession,
}: {
  onSession: (session: Session | null) => void;
}) {
  const { connection } = useConnection();
  const { network } = useNetwork();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const [testConnected, setTestConnected] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<Balance>();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const testWallet =
    typeof window === "undefined" ? undefined : window.__TXLINE_TEST_WALLET__;
  const publicKey =
    (testConnected ? testWallet?.publicKey : undefined) ??
    wallet.publicKey?.toBase58();
  const walletMismatch = Boolean(
    session && publicKey && session.walletPublicKey !== publicKey,
  );
  const authenticatedSession =
    session && !walletMismatch ? session : null;
  const balanceIdentity = `${network}:${publicKey ?? ""}`;
  const displayedBalance =
    balance?.identity === balanceIdentity ? balance.sol : undefined;

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (response) =>
        response.ok ? ((await response.json()) as Session) : null,
      )
      .then((value) => {
        setSession(value);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (walletMismatch) {
      onSession(null);
      void fetch("/api/auth/logout", { method: "POST" })
        .then((response) => {
          if (!response.ok) throw new Error("Logout failed");
          setSession(null);
        })
        .catch(() => {
          setSession(null);
          setError("Could not revoke the previous wallet session.");
        });
      return;
    }
    onSession(session);
  }, [onSession, session, walletMismatch]);

  useEffect(() => {
    let current = true;
    if (!publicKey) return () => {
      current = false;
    };
    let key: PublicKey;
    try {
      key = new PublicKey(publicKey);
    } catch {
      return () => {
        current = false;
      };
    }
    void connection
      .getBalance(key, "confirmed")
      .then((lamports) => {
        if (current) {
          setBalance({
            identity: balanceIdentity,
            sol: lamports / LAMPORTS_PER_SOL,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [balanceIdentity, connection, publicKey]);

  async function signIn() {
    if (!publicKey) return;
    const signer = testWallet?.signMessage ?? wallet.signMessage;
    if (!signer) {
      setError("This wallet does not support signMessage.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const challengeResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPublicKey: publicKey }),
      });
      const challenge = (await challengeResponse.json()) as {
        nonce: string;
        issuedAt: string;
        expiresAt: string;
        message: string;
        error?: string;
      };
      if (!challengeResponse.ok) throw new Error(challenge.error);
      const signature = await signer(
        new TextEncoder().encode(challenge.message),
      );
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletPublicKey: publicKey,
          nonce: challenge.nonce,
          issuedAt: challenge.issuedAt,
          expiresAt: challenge.expiresAt,
          signature: base64(signature),
        }),
      });
      const result = (await verifyResponse.json()) as Session & {
        error?: string;
      };
      if (!verifyResponse.ok) throw new Error(result.error);
      setSession(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
  }

  return (
    <section className="feature-card" aria-labelledby="wallet-title">
      <h2 id="wallet-title">Wallet session</h2>
      {!publicKey ? (
        <button
          disabled={!hydrated}
          onClick={() => {
            if (testWallet) setTestConnected(true);
            else setVisible(true);
          }}
        >
          Connect wallet
        </button>
      ) : authenticatedSession ? (
        <>
          <p>Signed in as {authenticatedSession.walletPublicKey}</p>
          {displayedBalance !== undefined && (
            <p>{displayedBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL on {network}</p>
          )}
          <button onClick={logout}>Log out</button>
        </>
      ) : (
        <>
          <p>{publicKey}</p>
          {displayedBalance !== undefined && (
            <p>{displayedBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL on {network}</p>
          )}
          <button disabled={busy || walletMismatch} onClick={signIn}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </>
      )}
      {walletMismatch && (
        <p role="alert">Wallet changed. Revoking the previous session…</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
