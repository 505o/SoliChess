import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GuildSettings, LinkRecord, PendingVerification } from "./types.js";

interface GuildSettingsRow {
  guild_id: string;
  verified_role_id: string;
  review_role_id: string;
  onboarding_category_id: string;
  rules_channel_id: string;
  verify_channel_id: string;
  log_channel_id: string;
}

interface LinkRow {
  guild_id: string;
  discord_user_id: string;
  chess_player_id: number;
  chess_username: string;
  linked_at: number;
  verified_via: string;
  account_status: string;
  last_checked_at: number | null;
  last_stats_json: string | null;
}

interface PendingRow {
  guild_id: string;
  discord_user_id: string;
  chess_username: string;
  chess_player_id: number;
  challenge_code: string;
  created_at: number;
  expires_at: number;
}

function mapGuild(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    verifiedRoleId: row.verified_role_id,
    reviewRoleId: row.review_role_id,
    onboardingCategoryId: row.onboarding_category_id,
    rulesChannelId: row.rules_channel_id,
    verifyChannelId: row.verify_channel_id,
    logChannelId: row.log_channel_id
  };
}

function mapLink(row: LinkRow): LinkRecord {
  return {
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    chessPlayerId: row.chess_player_id,
    chessUsername: row.chess_username,
    linkedAt: row.linked_at,
    verifiedVia: row.verified_via,
    accountStatus: row.account_status,
    lastCheckedAt: row.last_checked_at,
    lastStatsJson: row.last_stats_json
  };
}

function mapPending(row: PendingRow): PendingVerification {
  return {
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    chessUsername: row.chess_username,
    chessPlayerId: row.chess_player_id,
    challengeCode: row.challenge_code,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

export class AppDatabase {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        verified_role_id TEXT NOT NULL,
        review_role_id TEXT NOT NULL,
        onboarding_category_id TEXT NOT NULL,
        rules_channel_id TEXT NOT NULL,
        verify_channel_id TEXT NOT NULL,
        log_channel_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS links (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        chess_player_id INTEGER NOT NULL,
        chess_username TEXT NOT NULL,
        linked_at INTEGER NOT NULL,
        verified_via TEXT NOT NULL,
        account_status TEXT NOT NULL,
        last_checked_at INTEGER,
        last_stats_json TEXT,
        PRIMARY KEY (guild_id, discord_user_id),
        UNIQUE (guild_id, chess_player_id)
      );

      CREATE TABLE IF NOT EXISTS pending_verifications (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        chess_username TEXT NOT NULL,
        chess_player_id INTEGER NOT NULL,
        challenge_code TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        discord_user_id TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_links_guild ON links(guild_id);
      CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_verifications(expires_at);
    `);
  }

  upsertGuildSettings(settings: GuildSettings): void {
    this.db.prepare(`
      INSERT INTO guild_settings (
        guild_id, verified_role_id, review_role_id, onboarding_category_id,
        rules_channel_id, verify_channel_id, log_channel_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        verified_role_id = excluded.verified_role_id,
        review_role_id = excluded.review_role_id,
        onboarding_category_id = excluded.onboarding_category_id,
        rules_channel_id = excluded.rules_channel_id,
        verify_channel_id = excluded.verify_channel_id,
        log_channel_id = excluded.log_channel_id
    `).run(
      settings.guildId,
      settings.verifiedRoleId,
      settings.reviewRoleId,
      settings.onboardingCategoryId,
      settings.rulesChannelId,
      settings.verifyChannelId,
      settings.logChannelId,
      Date.now()
    );
  }

  getGuildSettings(guildId: string): GuildSettings | null {
    const row = this.db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?").get(guildId) as GuildSettingsRow | undefined;
    return row ? mapGuild(row) : null;
  }

  savePending(pending: PendingVerification): void {
    this.db.prepare(`
      INSERT INTO pending_verifications (
        guild_id, discord_user_id, chess_username, chess_player_id,
        challenge_code, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        chess_username = excluded.chess_username,
        chess_player_id = excluded.chess_player_id,
        challenge_code = excluded.challenge_code,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `).run(
      pending.guildId,
      pending.discordUserId,
      pending.chessUsername,
      pending.chessPlayerId,
      pending.challengeCode,
      pending.createdAt,
      pending.expiresAt
    );
  }

  getPending(guildId: string, discordUserId: string): PendingVerification | null {
    const row = this.db.prepare(`
      SELECT * FROM pending_verifications WHERE guild_id = ? AND discord_user_id = ?
    `).get(guildId, discordUserId) as PendingRow | undefined;
    return row ? mapPending(row) : null;
  }

  deletePending(guildId: string, discordUserId: string): void {
    this.db.prepare("DELETE FROM pending_verifications WHERE guild_id = ? AND discord_user_id = ?")
      .run(guildId, discordUserId);
  }

  deleteExpiredPending(now = Date.now()): number {
    return Number(this.db.prepare("DELETE FROM pending_verifications WHERE expires_at < ?").run(now).changes);
  }

  getLinkByDiscord(guildId: string, discordUserId: string): LinkRecord | null {
    const row = this.db.prepare("SELECT * FROM links WHERE guild_id = ? AND discord_user_id = ?")
      .get(guildId, discordUserId) as LinkRow | undefined;
    return row ? mapLink(row) : null;
  }

  getLinkByChessPlayer(guildId: string, chessPlayerId: number): LinkRecord | null {
    const row = this.db.prepare("SELECT * FROM links WHERE guild_id = ? AND chess_player_id = ?")
      .get(guildId, chessPlayerId) as LinkRow | undefined;
    return row ? mapLink(row) : null;
  }

  createLink(link: LinkRecord): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO links (
          guild_id, discord_user_id, chess_player_id, chess_username, linked_at,
          verified_via, account_status, last_checked_at, last_stats_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        link.guildId,
        link.discordUserId,
        link.chessPlayerId,
        link.chessUsername,
        link.linkedAt,
        link.verifiedVia,
        link.accountStatus,
        link.lastCheckedAt,
        link.lastStatsJson
      );
      this.deletePending(link.guildId, link.discordUserId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  updateLinkCheck(
    guildId: string,
    discordUserId: string,
    chessUsername: string,
    status: string,
    statsJson: string | null
  ): void {
    this.db.prepare(`
      UPDATE links SET chess_username = ?, account_status = ?, last_checked_at = ?, last_stats_json = ?
      WHERE guild_id = ? AND discord_user_id = ?
    `).run(chessUsername, status, Date.now(), statsJson, guildId, discordUserId);
  }

  listLinks(guildId?: string): LinkRecord[] {
    const rows = guildId
      ? this.db.prepare("SELECT * FROM links WHERE guild_id = ? ORDER BY linked_at").all(guildId) as unknown as LinkRow[]
      : this.db.prepare("SELECT * FROM links ORDER BY guild_id, linked_at").all() as unknown as LinkRow[];
    return rows.map(mapLink);
  }

  deleteLink(guildId: string, discordUserId: string): boolean {
    return Number(this.db.prepare("DELETE FROM links WHERE guild_id = ? AND discord_user_id = ?")
      .run(guildId, discordUserId).changes) > 0;
  }

  audit(guildId: string, discordUserId: string | null, action: string, details: unknown): void {
    this.db.prepare(`
      INSERT INTO audit_log (guild_id, discord_user_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, discordUserId, action, JSON.stringify(details), Date.now());
  }

  close(): void {
    this.db.close();
  }
}
