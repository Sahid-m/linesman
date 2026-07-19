CREATE TYPE "public"."agent_risk_level" AS ENUM('conservative', 'balanced', 'aggressive');--> statement-breakpoint
CREATE TABLE "agent_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" "network" NOT NULL,
	"risk_level" "agent_risk_level" DEFAULT 'balanced' NOT NULL,
	"max_stake_per_trade" numeric(12, 4) DEFAULT '100.0000' NOT NULL,
	"min_edge_pct" numeric(6, 4) DEFAULT '1.5000' NOT NULL,
	"auto_trade" boolean DEFAULT true NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_config_network_unique" UNIQUE("network")
);
