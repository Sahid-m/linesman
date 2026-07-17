import { getDb } from "@/db/client";
import { txlineCredentials } from "@/db/schema";
import type { Network } from "@/lib/network/config";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1_000;

export type TxlineCredential = {
  id: string;
  userId: string;
  network: Network;
  jwt: string;
  apiToken: string | null;
  subscriptionTxSignature: string | null;
  serviceLevelId: number | null;
  durationWeeks: number | null;
  setupState: "guest_created" | "subscribed" | "activated";
  subscriptionCreatedAt: Date | null;
  guestJwtExpiresAt: Date;
  subscriptionExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CredentialStateInput = {
  userId: string;
  network: Network;
  jwt: string;
  apiToken?: string | null;
  subscriptionTxSignature?: string | null;
  serviceLevelId?: number | null;
  durationWeeks?: number | null;
  setupState: TxlineCredential["setupState"];
  subscriptionCreatedAt?: Date | null;
};

function guestJwtExpiry(jwt: string): Date {
  const payloadPart = jwt.split(".")[1];
  if (!payloadPart) throw new Error("Guest JWT must contain an exp claim");

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    throw new Error("Guest JWT must contain an exp claim");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("exp" in payload) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error("Guest JWT must contain an exp claim");
  }

  return new Date(payload.exp * 1_000);
}

function subscriptionExpiry(
  subscriptionCreatedAt: Date | null,
  durationWeeks: number | null,
): Date | null {
  if (subscriptionCreatedAt === null && durationWeeks === null) return null;
  if (subscriptionCreatedAt === null || durationWeeks === null) {
    throw new Error(
      "Subscription creation time and duration weeks must be provided together",
    );
  }
  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0) {
    throw new Error("Subscription duration weeks must be a positive integer");
  }

  return new Date(
    subscriptionCreatedAt.getTime() + durationWeeks * MILLISECONDS_PER_WEEK,
  );
}

export async function getCredential(
  userId: string,
  network: Network,
): Promise<TxlineCredential | null> {
  const row = await getDb().query.txlineCredentials.findFirst({
    where: (credentials, { and, eq }) =>
      and(eq(credentials.userId, userId), eq(credentials.network, network)),
  });

  if (!row) return null;

  const { encryptedApiToken, encryptedJwt, ...credential } = row;
  return {
    ...credential,
    network: row.network as Network,
    jwt: decryptSecret(encryptedJwt),
    apiToken: encryptedApiToken ? decryptSecret(encryptedApiToken) : null,
  };
}

export async function upsertCredentialState(
  input: CredentialStateInput,
): Promise<void> {
  if (input.setupState === "activated" && !input.apiToken) {
    throw new Error("Activated credentials require an API token");
  }

  const subscriptionCreatedAt = input.subscriptionCreatedAt ?? null;
  const durationWeeks = input.durationWeeks ?? null;
  const values = {
    userId: input.userId,
    network: input.network,
    encryptedJwt: encryptSecret(input.jwt),
    encryptedApiToken: input.apiToken
      ? encryptSecret(input.apiToken)
      : null,
    subscriptionTxSignature: input.subscriptionTxSignature ?? null,
    serviceLevelId: input.serviceLevelId ?? null,
    durationWeeks,
    setupState: input.setupState,
    subscriptionCreatedAt,
    guestJwtExpiresAt: guestJwtExpiry(input.jwt),
    subscriptionExpiresAt: subscriptionExpiry(
      subscriptionCreatedAt,
      durationWeeks,
    ),
    updatedAt: new Date(),
  };

  await getDb()
    .insert(txlineCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: [txlineCredentials.userId, txlineCredentials.network],
      set: values,
    });
}
