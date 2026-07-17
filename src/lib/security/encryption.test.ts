import { beforeEach, describe, expect, it } from "vitest";

describe("credential encryption", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY_BASE64 =
      Buffer.alloc(32, 7).toString("base64");
  });

  it("round-trips an encrypted credential", async () => {
    const { decryptSecret, encryptSecret } = await import("./encryption");
    const envelope = encryptSecret("secret-token");
    expect(envelope).not.toContain("secret-token");
    expect(decryptSecret(envelope)).toBe("secret-token");
  });

  it("rejects a modified authentication tag", async () => {
    const { decryptSecret, encryptSecret } = await import("./encryption");
    const envelope = encryptSecret("secret-token");
    const parsed = JSON.parse(
      Buffer.from(envelope, "base64url").toString(),
    ) as { tag: string };
    parsed.tag = Buffer.alloc(16).toString("base64url");
    const tampered = Buffer.from(JSON.stringify(parsed)).toString("base64url");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
