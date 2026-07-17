import { z } from "zod";

const fixtureRouteSchema = z.object({
  network: z.enum(["devnet", "mainnet"]),
  fixtureId: z.coerce.number().int().positive().safe(),
});

export function parseFixtureRouteInput(
  network: string | null,
  fixtureId: string,
) {
  return fixtureRouteSchema.parse({ network, fixtureId });
}
