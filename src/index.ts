import { loadConfig } from "./config.js";
import { ChessGateBot } from "./bot.js";
import { AppDatabase } from "./database.js";
import { AppHttpServer } from "./http-server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new AppDatabase(config.databasePath);
  const bot = new ChessGateBot(config, database);
  const httpServer = new AppHttpServer();
  const httpPort = await httpServer.start(config.httpPort);
  console.log(`HTTP server listening on port ${httpPort}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down...`);
    bot.client.destroy();
    await httpServer.stop();
    database.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await bot.start();
  } catch (error) {
    await httpServer.stop();
    database.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
