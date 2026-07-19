import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAgentSigner } from "./memo";

describe("getAgentSigner", () => {
  const originalSecret = process.env.AGENT_DEVNET_SECRET_KEY_BASE58;

  beforeEach(() => {
    delete process.env.AGENT_DEVNET_SECRET_KEY_BASE58;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AGENT_DEVNET_SECRET_KEY_BASE58;
    } else {
      process.env.AGENT_DEVNET_SECRET_KEY_BASE58 = originalSecret;
    }
  });

  it("throws without a configured secret key", () => {
    expect(() => getAgentSigner()).toThrow(
      "AGENT_DEVNET_SECRET_KEY_BASE58 is required",
    );
  });

  it("derives the matching public key from the configured secret", () => {
    const keypair = Keypair.generate();
    process.env.AGENT_DEVNET_SECRET_KEY_BASE58 = bs58.encode(
      keypair.secretKey,
    );
    expect(getAgentSigner().publicKey.toBase58()).toBe(
      keypair.publicKey.toBase58(),
    );
  });
});
