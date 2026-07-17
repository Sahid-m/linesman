import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
}));
const networkMocks = vi.hoisted(() => ({
  getNetworkConfig: vi.fn((network: "devnet" | "mainnet") => ({
    serviceLevels: network === "devnet" ? [1] : [1, 12],
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  getDb: () => ({ insert: dbMocks.insert }),
}));
vi.mock("@/db/schema", () => ({
  txlineCredentials: { userId: {}, network: {} },
}));
vi.mock("@/lib/network/config", () => networkMocks);
vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: (value: string) => value,
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

const jwt = [
  "header",
  Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString("base64url"),
  "signature",
].join(".");

function subscribedInput(
  overrides: Partial<{
    network: "devnet" | "mainnet";
    serviceLevelId: number | null;
    durationWeeks: number | null;
  }> = {},
) {
  return {
    userId: "2ad3babe-717a-48c2-abea-57f70e73aec3",
    network: "devnet" as const,
    jwt,
    setupState: "subscribed" as const,
    subscriptionTxSignature: "tx-signature",
    subscriptionCreatedAt: new Date("2026-07-17T12:00:00Z"),
    serviceLevelId: 1,
    durationWeeks: 4,
    ...overrides,
  };
}

describe("credential subscription boundaries", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY_BASE64 =
      Buffer.alloc(32, 7).toString("base64");
    dbMocks.insert.mockReset().mockReturnValue({ values: dbMocks.values });
    dbMocks.values
      .mockReset()
      .mockReturnValue({ onConflictDoUpdate: dbMocks.onConflictDoUpdate });
    dbMocks.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
    networkMocks.getNetworkConfig.mockClear();
  });

  it.each([
    ["missing duration", { durationWeeks: null }],
    ["non-four-week duration", { durationWeeks: 3 }],
    ["missing service level", { serviceLevelId: null }],
    ["unsupported devnet service level", { serviceLevelId: 12 }],
    [
      "unsupported mainnet service level",
      { network: "mainnet" as const, serviceLevelId: 2 },
    ],
  ])("rejects %s", async (_label, overrides) => {
    const { upsertCredentialState } = await import("./credentials");

    await expect(
      upsertCredentialState(subscribedInput(overrides)),
    ).rejects.toThrow();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-four-week activated credential", async () => {
    const { upsertCredentialState } = await import("./credentials");

    await expect(
      upsertCredentialState({
        ...subscribedInput({ durationWeeks: 8 }),
        setupState: "activated",
        apiToken: "api-token",
      }),
    ).rejects.toThrow();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["devnet service 1", subscribedInput()],
    [
      "mainnet service 1",
      subscribedInput({ network: "mainnet", serviceLevelId: 1 }),
    ],
    [
      "mainnet service 12",
      subscribedInput({ network: "mainnet", serviceLevelId: 12 }),
    ],
    [
      "activated mainnet service 12",
      {
        ...subscribedInput({ network: "mainnet", serviceLevelId: 12 }),
        setupState: "activated" as const,
        apiToken: "api-token",
      },
    ],
  ])("accepts %s for a four-week subscription", async (_label, input) => {
    const { upsertCredentialState } = await import("./credentials");

    await expect(upsertCredentialState(input)).resolves.toBeUndefined();
    expect(networkMocks.getNetworkConfig).toHaveBeenCalledWith(input.network);
    expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("accepts guest-created state with null subscription fields", async () => {
    const { upsertCredentialState } = await import("./credentials");

    await expect(
      upsertCredentialState({
        userId: "2ad3babe-717a-48c2-abea-57f70e73aec3",
        network: "devnet",
        jwt,
        setupState: "guest_created",
      }),
    ).resolves.toBeUndefined();
    expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledOnce();
  });
});
