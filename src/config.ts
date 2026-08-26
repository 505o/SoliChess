import "dotenv/config";
import type { ChessComOAuthConfig } from "./oauth.js";

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  chessComUserAgent: string;
  databaseUrl: string;
  databaseUrlDirect: string;
  databaseRetentionDays: number;
  checkIntervalMinutes: number;
  verificationTtlMinutes: number;
  httpPort: number;
  engineDepth: number;
  gameCheckIntervalMinutes: number;
  chessComOAuth?: ChessComOAuthConfig;
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

function optionalOAuthConfig(): ChessComOAuthConfig | undefined {
  const names = [
    "CHESSCOM_OAUTH_CLIENT_ID",
    "CHESSCOM_OAUTH_AUTHORIZE_URL",
    "CHESSCOM_OAUTH_REDIRECT_URI",
    "OAUTH_BRIDGE_URL",
    "OAUTH_BRIDGE_SECRET"
  ] as const;
  const values = Object.fromEntries(names.map((name) => [name, process.env[name]?.trim() ?? ""])) as Record<(typeof names)[number], string>;
  if (names.every((name) => !values[name])) return undefined;
  const missing = names.filter((name) => !values[name]);
  if (missing.length) throw new Error(`Incomplete Chess.com OAuth configuration. Missing: ${missing.join(", ")}`);
  if (values.OAUTH_BRIDGE_SECRET.length < 32) throw new Error("OAUTH_BRIDGE_SECRET must be at least 32 characters");
  return {
    clientId: values.CHESSCOM_OAUTH_CLIENT_ID,
    authorizeUrl: values.CHESSCOM_OAUTH_AUTHORIZE_URL,
    redirectUri: values.CHESSCOM_OAUTH_REDIRECT_URI,
    scopes: process.env.CHESSCOM_OAUTH_SCOPES?.trim() ?? "",
    bridgeUrl: values.OAUTH_BRIDGE_URL,
    bridgeSecret: values.OAUTH_BRIDGE_SECRET
  };
}

export function loadConfig(): AppConfig {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const chessComOAuth = optionalOAuthConfig();
  return {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    ...(guildId ? { discordGuildId: guildId } : {}),
    chessComUserAgent: required("CHESSCOM_USER_AGENT"),
    databaseUrl: required("DATABASE_URL"),
    databaseUrlDirect: required("DATABASE_URL_DIRECT"),
    databaseRetentionDays: positiveInteger("DATABASE_RETENTION_DAYS", 90),
    checkIntervalMinutes: positiveInteger("CHECK_INTERVAL_MINUTES", 360),
    verificationTtlMinutes: positiveInteger("VERIFICATION_TTL_MINUTES", 30),
    httpPort: positiveInteger("HTTP_PORT", 3000),
    engineDepth: positiveInteger("ENGINE_DEPTH", 10),
    gameCheckIntervalMinutes: positiveInteger("GAME_CHECK_INTERVAL_MINUTES", 30),
    ...(chessComOAuth ? { chessComOAuth } : {})
  };
}
