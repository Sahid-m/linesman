/**
 * Loads .env.local into process.env before dynamically importing the real
 * entrypoint, so secrets are set before any module reads them at import
 * time (tsx/node don't auto-load .env.local the way `next dev` does).
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const target = process.argv[2];
if (!target) throw new Error("Usage: with-env.ts <script-to-run.ts> [...args]");
process.argv.splice(2, 1);
void import(pathToFileURL(target).href);
