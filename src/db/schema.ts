import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const network = pgEnum("network", ["devnet", "mainnet"]);

export const setupState = pgEnum("setup_state", [
  "guest_created",
  "subscribed",
  "activated",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletPublicKey: text("wallet_public_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const walletNonces = pgTable("wallet_nonces", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletPublicKey: text("wallet_public_key").notNull(),
  nonceHash: text("nonce_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const txlineCredentials = pgTable(
  "txline_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: network("network").notNull(),
    encryptedJwt: text("encrypted_jwt").notNull(),
    encryptedApiToken: text("encrypted_api_token"),
    subscriptionTxSignature: text("subscription_tx_signature"),
    serviceLevelId: integer("service_level_id"),
    durationWeeks: integer("duration_weeks"),
    setupState: setupState("setup_state").notNull(),
    subscriptionCreatedAt: timestamp("subscription_created_at", {
      withTimezone: true,
    }),
    guestJwtExpiresAt: timestamp("guest_jwt_expires_at", {
      withTimezone: true,
    }).notNull(),
    subscriptionExpiresAt: timestamp("subscription_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("txline_credentials_user_id_network_unique").on(
      table.userId,
      table.network,
    ),
  ],
);
