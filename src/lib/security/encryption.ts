import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Envelope = { v: 1; iv: string; tag: string; ciphertext: string };

function key(): Buffer {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY_BASE64;
  if (!value) throw new Error("CREDENTIAL_ENCRYPTION_KEY_BASE64 is required");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return decoded;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}

export function decryptSecret(value: string): string {
  const envelope = JSON.parse(
    Buffer.from(value, "base64url").toString("utf8"),
  ) as Envelope;
  if (envelope.v !== 1) throw new Error("Unsupported credential envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
