import "dotenv/config";
import path from "node:path";

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  chessComUserAgent: string;
  databasePath: string;
  checkIntervalMinutes: number;
  verificationTtlMinutes: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  return {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    ...(guildId ? { discordGuildId: guildId } : {}),
    chessComUserAgent: required("CHESSCOM_USER_AGENT"),
    databasePath: path.resolve(process.env.DATABASE_PATH?.trim() || "./data/chess-gate.db"),
    checkIntervalMinutes: positiveInteger("CHECK_INTERVAL_MINUTES", 360),
    verificationTtlMinutes: positiveInteger("VERIFICATION_TTL_MINUTES", 30)
  };
}
