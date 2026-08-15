import "dotenv/config";
import path from "node:path";
import { AppDatabase } from "./database.js";
import { NeonDatabase } from "./neon-database.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const directUrl = required("DATABASE_URL_DIRECT");
  const sqlitePath = path.resolve(process.env.DATABASE_PATH?.trim() || "./data/chess-gate.db");
  const retentionDays = Number.parseInt(process.env.DATABASE_RETENTION_DAYS?.trim() || "90", 10);
  const source = new AppDatabase(sqlitePath);
  const target = await NeonDatabase.connect(directUrl, { auditRetentionDays: retentionDays }, directUrl);

  try {
    const before = await target.getCounts();
    if (Object.values(before).every((count) => count === 0)) {
      await target.importFromSQLite(source);
      const after = await target.getCounts();
      console.log("Migration completed", after);
    } else {
      console.log("Neon already contains data; migration skipped", before);
    }
  } finally {
    source.close();
    await target.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
