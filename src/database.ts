import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GuildSettings, LinkRecord, PendingVerification, PuzzleSession, PuzzleStats } from "./types.js";

interface GuildSettingsRow {
  guild_id: string;
  verified_role_id: string;
  review_role_id: string;
  onboarding_category_id: string;
  rules_channel_id: string;
  verify_channel_id: string;
  log_channel_id: string;
  analysis_channel_id: string | null;
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
  last_analyzed_game_url: string | null;
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

interface PuzzleSessionRow {
  guild_id: string;
  discord_user_id: string;
  puzzle_id: string;
  current_fen: string;
  solution_moves_json: string;
  current_index: number;
  puzzle_rating: number;
  themes_json: string;
  user_color: "w" | "b";
  failed_once: number;
  started_at: number;
}

interface PuzzleStatsRow {
  guild_id: string;
  discord_user_id: string;
  rating: number;
  solved: number;
  failed: number;
  streak: number;
  best_streak: number;
  updated_at: number;
}

interface AuditLogRow {
  id: number;
  guild_id: string;
  discord_user_id: string | null;
  action: string;
  details: string;
  created_at: number;
}

export interface AuditLogRecord {
  id: number;
  guildId: string;
  discordUserId: string | null;
  action: string;
  details: string;
  createdAt: number;
}

interface ReviewSessionRow {
  id: string;
  guild_id: string;
  result_json: string;
  current_index: number;
  content: string;
  expires_at: number;
}

export interface PersistedReviewSession {
  id: string;
  guildId: string;
  resultJson: string;
  currentIndex: number;
  content: string;
  expiresAt: number;
}

function mapGuild(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    verifiedRoleId: row.verified_role_id,
    reviewRoleId: row.review_role_id,
    onboardingCategoryId: row.onboarding_category_id,
    rulesChannelId: row.rules_channel_id,
    verifyChannelId: row.verify_channel_id,
    logChannelId: row.log_channel_id,
    analysisChannelId: row.analysis_channel_id ?? row.log_channel_id
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
    lastStatsJson: row.last_stats_json,
    lastAnalyzedGameUrl: row.last_analyzed_game_url
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

function mapPuzzleSession(row: PuzzleSessionRow): PuzzleSession {
  return {
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    puzzleId: row.puzzle_id,
    currentFen: row.current_fen,
    solutionMoves: JSON.parse(row.solution_moves_json) as string[],
    currentIndex: row.current_index,
    puzzleRating: row.puzzle_rating,
    themes: JSON.parse(row.themes_json) as string[],
    userColor: row.user_color,
    failedOnce: row.failed_once === 1,
    startedAt: row.started_at
  };
}

function mapPuzzleStats(row: PuzzleStatsRow): PuzzleStats {
  return {
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    rating: row.rating,
    solved: row.solved,
    failed: row.failed,
    streak: row.streak,
    bestStreak: row.best_streak,
    updatedAt: row.updated_at
  };
}

export class AppDatabase {
  private readonly db: DatabaseSync;
  private reportableChangeListener: (() => void) | null = null;

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
        analysis_channel_id TEXT,
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
        last_analyzed_game_url TEXT,
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

      CREATE TABLE IF NOT EXISTS puzzle_sessions (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        puzzle_id TEXT NOT NULL,
        current_fen TEXT NOT NULL,
        solution_moves_json TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        puzzle_rating INTEGER NOT NULL,
        themes_json TEXT NOT NULL,
        user_color TEXT NOT NULL CHECK(user_color IN ('w', 'b')),
        failed_once INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE TABLE IF NOT EXISTS puzzle_stats (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        rating INTEGER NOT NULL DEFAULT 1200,
        solved INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE TABLE IF NOT EXISTS review_sessions (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_links_guild ON links(guild_id);
      CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_verifications(expires_at);
      CREATE INDEX IF NOT EXISTS idx_review_session_expiry ON review_sessions(expires_at);
    `);
    this.ensureColumn("guild_settings", "analysis_channel_id", "TEXT");
    this.ensureColumn("links", "last_analyzed_game_url", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  onReportableChange(listener: () => void): void {
    this.reportableChangeListener = listener;
  }

  private reportableChanged(): void {
    this.reportableChangeListener?.();
  }

  upsertGuildSettings(settings: GuildSettings): void {
    this.db.prepare(`
      INSERT INTO guild_settings (
        guild_id, verified_role_id, review_role_id, onboarding_category_id,
        rules_channel_id, verify_channel_id, log_channel_id, analysis_channel_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        verified_role_id = excluded.verified_role_id,
        review_role_id = excluded.review_role_id,
        onboarding_category_id = excluded.onboarding_category_id,
        rules_channel_id = excluded.rules_channel_id,
        verify_channel_id = excluded.verify_channel_id,
        log_channel_id = excluded.log_channel_id,
        analysis_channel_id = excluded.analysis_channel_id
    `).run(
      settings.guildId,
      settings.verifiedRoleId,
      settings.reviewRoleId,
      settings.onboardingCategoryId,
      settings.rulesChannelId,
      settings.verifyChannelId,
      settings.logChannelId,
      settings.analysisChannelId,
      Date.now()
    );
    this.reportableChanged();
  }

  getGuildSettings(guildId: string): GuildSettings | null {
    const row = this.db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?").get(guildId) as GuildSettingsRow | undefined;
    return row ? mapGuild(row) : null;
  }

  listGuildSettings(): GuildSettings[] {
    const rows = this.db.prepare("SELECT * FROM guild_settings ORDER BY guild_id").all() as unknown as GuildSettingsRow[];
    return rows.map(mapGuild);
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
          verified_via, account_status, last_checked_at, last_stats_json, last_analyzed_game_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        link.guildId,
        link.discordUserId,
        link.chessPlayerId,
        link.chessUsername,
        link.linkedAt,
        link.verifiedVia,
        link.accountStatus,
        link.lastCheckedAt,
        link.lastStatsJson,
        link.lastAnalyzedGameUrl
      );
      this.deletePending(link.guildId, link.discordUserId);
      this.db.exec("COMMIT");
      this.reportableChanged();
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
    this.reportableChanged();
  }

  listLinks(guildId?: string): LinkRecord[] {
    const rows = guildId
      ? this.db.prepare("SELECT * FROM links WHERE guild_id = ? ORDER BY linked_at").all(guildId) as unknown as LinkRow[]
      : this.db.prepare("SELECT * FROM links ORDER BY guild_id, linked_at").all() as unknown as LinkRow[];
    return rows.map(mapLink);
  }

  deleteLink(guildId: string, discordUserId: string): boolean {
    const deleted = Number(this.db.prepare("DELETE FROM links WHERE guild_id = ? AND discord_user_id = ?")
      .run(guildId, discordUserId).changes) > 0;
    if (deleted) this.reportableChanged();
    return deleted;
  }

  updateLastAnalyzedGame(guildId: string, discordUserId: string, gameUrl: string): void {
    this.db.prepare(`
      UPDATE links SET last_analyzed_game_url = ? WHERE guild_id = ? AND discord_user_id = ?
    `).run(gameUrl, guildId, discordUserId);
    this.reportableChanged();
  }

  audit(guildId: string, discordUserId: string | null, action: string, details: unknown): void {
    this.db.prepare(`
      INSERT INTO audit_log (guild_id, discord_user_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, discordUserId, action, JSON.stringify(details), Date.now());
    this.reportableChanged();
  }

  savePuzzleSession(session: PuzzleSession): void {
    this.db.prepare(`
      INSERT INTO puzzle_sessions (
        guild_id, discord_user_id, puzzle_id, current_fen, solution_moves_json,
        current_index, puzzle_rating, themes_json, user_color, failed_once, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        puzzle_id = excluded.puzzle_id,
        current_fen = excluded.current_fen,
        solution_moves_json = excluded.solution_moves_json,
        current_index = excluded.current_index,
        puzzle_rating = excluded.puzzle_rating,
        themes_json = excluded.themes_json,
        user_color = excluded.user_color,
        failed_once = excluded.failed_once,
        started_at = excluded.started_at
    `).run(
      session.guildId,
      session.discordUserId,
      session.puzzleId,
      session.currentFen,
      JSON.stringify(session.solutionMoves),
      session.currentIndex,
      session.puzzleRating,
      JSON.stringify(session.themes),
      session.userColor,
      session.failedOnce ? 1 : 0,
      session.startedAt
    );
  }

  getPuzzleSession(guildId: string, discordUserId: string): PuzzleSession | null {
    const row = this.db.prepare(
      "SELECT * FROM puzzle_sessions WHERE guild_id = ? AND discord_user_id = ?"
    ).get(guildId, discordUserId) as PuzzleSessionRow | undefined;
    return row ? mapPuzzleSession(row) : null;
  }

  deletePuzzleSession(guildId: string, discordUserId: string): void {
    this.db.prepare("DELETE FROM puzzle_sessions WHERE guild_id = ? AND discord_user_id = ?")
      .run(guildId, discordUserId);
  }

  getPuzzleStats(guildId: string, discordUserId: string): PuzzleStats {
    const row = this.db.prepare(
      "SELECT * FROM puzzle_stats WHERE guild_id = ? AND discord_user_id = ?"
    ).get(guildId, discordUserId) as PuzzleStatsRow | undefined;
    return row ? mapPuzzleStats(row) : {
      guildId,
      discordUserId,
      rating: 1200,
      solved: 0,
      failed: 0,
      streak: 0,
      bestStreak: 0,
      updatedAt: Date.now()
    };
  }

  savePuzzleStats(stats: PuzzleStats): void {
    this.db.prepare(`
      INSERT INTO puzzle_stats (
        guild_id, discord_user_id, rating, solved, failed, streak, best_streak, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        rating = excluded.rating,
        solved = excluded.solved,
        failed = excluded.failed,
        streak = excluded.streak,
        best_streak = excluded.best_streak,
        updated_at = excluded.updated_at
    `).run(
      stats.guildId,
      stats.discordUserId,
      stats.rating,
      stats.solved,
      stats.failed,
      stats.streak,
      stats.bestStreak,
      stats.updatedAt
    );
    this.reportableChanged();
  }

  listPuzzleStats(guildId: string): PuzzleStats[] {
    const rows = this.db.prepare(
      "SELECT * FROM puzzle_stats WHERE guild_id = ? ORDER BY rating DESC, solved DESC LIMIT 20"
    ).all(guildId) as unknown as PuzzleStatsRow[];
    return rows.map(mapPuzzleStats);
  }

  listAllPuzzleStats(): PuzzleStats[] {
    const rows = this.db.prepare(
      "SELECT * FROM puzzle_stats ORDER BY guild_id, rating DESC, solved DESC"
    ).all() as unknown as PuzzleStatsRow[];
    return rows.map(mapPuzzleStats);
  }

  listAuditLog(limit = 5_000): AuditLogRecord[] {
    const safeLimit = Math.max(1, Math.min(20_000, Math.trunc(limit)));
    const rows = this.db.prepare(
      "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?"
    ).all(safeLimit) as unknown as AuditLogRow[];
    return rows.reverse().map((row) => ({
      id: row.id,
      guildId: row.guild_id,
      discordUserId: row.discord_user_id,
      action: row.action,
      details: row.details,
      createdAt: row.created_at
    }));
  }

  saveReviewSession(session: PersistedReviewSession): void {
    this.db.prepare(`
      INSERT INTO review_sessions (id, guild_id, result_json, current_index, content, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        current_index = excluded.current_index,
        content = excluded.content,
        expires_at = excluded.expires_at
    `).run(
      session.id,
      session.guildId,
      session.resultJson,
      session.currentIndex,
      session.content,
      session.expiresAt
    );
  }

  getReviewSession(id: string, guildId: string): PersistedReviewSession | null {
    const row = this.db.prepare(
      "SELECT * FROM review_sessions WHERE id = ? AND guild_id = ?"
    ).get(id, guildId) as ReviewSessionRow | undefined;
    return row ? {
      id: row.id,
      guildId: row.guild_id,
      resultJson: row.result_json,
      currentIndex: row.current_index,
      content: row.content,
      expiresAt: row.expires_at
    } : null;
  }

  updateReviewSessionIndex(id: string, guildId: string, currentIndex: number): void {
    this.db.prepare(
      "UPDATE review_sessions SET current_index = ? WHERE id = ? AND guild_id = ?"
    ).run(currentIndex, id, guildId);
  }

  deleteExpiredReviewSessions(now = Date.now()): number {
    return Number(this.db.prepare("DELETE FROM review_sessions WHERE expires_at < ?").run(now).changes);
  }

  close(): void {
    this.db.close();
  }
}
