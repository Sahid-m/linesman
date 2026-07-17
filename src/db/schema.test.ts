import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

it("requires a non-null four-week duration for subscribed credentials", () => {
  const migrationDirectory = join(process.cwd(), "drizzle");
  const initialMigration = readdirSync(migrationDirectory).find((file) =>
    /^0000_.+\.sql$/.test(file),
  );
  expect(initialMigration).toBeDefined();

  const sql = readFileSync(
    join(migrationDirectory, initialMigration!),
    "utf8",
  );
  expect(sql).toMatch(
    /setup_state" IN \('subscribed', 'activated'\)\s+AND "txline_credentials"\."duration_weeks" IS NOT NULL\s+AND "txline_credentials"\."duration_weeks" = 4/,
  );
});
