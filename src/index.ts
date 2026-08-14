import { loadConfig } from "./config.js";
import { ChessGateBot } from "./bot.js";
import { AppDatabase } from "./database.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new AppDatabase(config.databasePath);
  const bot = new ChessGateBot(config, database);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down...`);
    bot.client.destroy();
    database.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await bot.start();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
