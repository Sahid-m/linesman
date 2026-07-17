import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return drizzle(neon(databaseUrl), { schema });
}

export function getDb(): Database {
  database ??= createDatabase();
  return database;
}
