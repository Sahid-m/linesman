CREATE TYPE "public"."agent_position_mode" AS ENUM('live', 'replay');--> statement-breakpoint
CREATE TYPE "public"."agent_position_side" AS ENUM('home', 'away');--> statement-breakpoint
CREATE TYPE "public"."agent_position_status" AS ENUM('open', 'graded');--> statement-breakpoint
CREATE TABLE "agent_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" "network" NOT NULL,
	"fixture_id" integer NOT NULL,
	"mode" "agent_position_mode" NOT NULL,
	"event_seq" integer NOT NULL,
	"event_action" text NOT NULL,
	"side" "agent_position_side" NOT NULL,
	"counterparty_venue" text NOT NULL,
	"size" numeric(12, 4) NOT NULL,
	"entry_fair_value" numeric(6, 4) NOT NULL,
	"memo_tx_signature" text,
	"rationale" text,
	"status" "agent_position_status" DEFAULT 'open' NOT NULL,
	"settled_fair_value" numeric(6, 4),
	"proof_receipt" jsonb,
	"pnl" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"graded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_venue_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"venue" text NOT NULL,
	"bookmaker" text,
	"home_implied_pct" numeric(6, 4),
	"away_implied_pct" numeric(6, 4),
	"draw_implied_pct" numeric(6, 4),
	"observed_at" timestamp with time zone NOT NULL,
	"reaction_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_venue_observations" ADD CONSTRAINT "agent_venue_observations_position_id_agent_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."agent_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_positions_fixture_seq_side_unique" ON "agent_positions" USING btree ("fixture_id","event_seq","side");
