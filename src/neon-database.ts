import { gzipSync, gunzipSync } from "node:zlib";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { compactStatsJson } from "./chesscom.js";
import type { AppDatabase, AuditLogRecord, PersistedReviewSession } from "./database.js";
import type { BotDatabase } from "./storage.js";
import type {
  DailyPuzzleAttempt,
  DailyPuzzleChallenge,
  DailyPuzzleSettings,
  GuildSettings,
  LinkRecord,
  PendingVerification,
  PuzzleSession,
  PuzzleStats
} from "./types.js";

type SqlClient = NeonQueryFunction<false, false>;
type Row = Record<string, unknown>;

export interface NeonDatabaseOptions {
  auditRetentionDays: number;
}

export interface DatabaseCounts {
  guildSettings: number;
  links: number;
  pendingVerifications: number;
  auditRecords: number;
  puzzleSessions: number;
  puzzleStats: number;
  reviewSessions: number;
  dailyPuzzleSettings: number;
  dailyPuzzles: number;
  dailyPuzzleAttempts: number;
}

function key(guildId: string, userId: string): string {
  return `${guildId}\u0000${userId}`;
}

function playerKey(guildId: string, playerId: number): string {
  return `${guildId}\u0000${playerId}`;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : numberValue(value);
}

function encodeReview(resultJson: string): string {
  return gzipSync(Buffer.from(resultJson, "utf8"), { level: 9 }).toString("base64");
}

function decodeReview(encoded: string): string {
  return gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
}

function clonePuzzleSession(session: PuzzleSession): PuzzleSession {
  return { ...session, solutionMoves: [...session.solutionMoves], themes: [...session.themes] };
}

function cloneDailyPuzzle(challenge: DailyPuzzleChallenge): DailyPuzzleChallenge {
  return { ...challenge, solutionMoves: [...challenge.solutionMoves], themes: [...challenge.themes] };
}

export class NeonDatabase implements BotDatabase {
  private readonly sql: SqlClient;
  private readonly guilds = new Map<string, GuildSettings>();
  private readonly links = new Map<string, LinkRecord>();
  private readonly players = new Map<string, string>();
  private readonly pending = new Map<string, PendingVerification>();
  private readonly puzzleSessions = new Map<string, PuzzleSession>();
  private readonly puzzleStats = new Map<string, PuzzleStats>();
  private readonly reviewSessions = new Map<string, PersistedReviewSession>();
  private readonly dailyPuzzleSettings = new Map<string, DailyPuzzleSettings>();
  private readonly dailyPuzzles = new Map<string, DailyPuzzleChallenge>();
  private readonly dailyPuzzleAttempts = new Map<string, DailyPuzzleAttempt>();
  private readonly auditRecords: AuditLogRecord[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private writeError: unknown = null;
  private nextAuditId = 1;

  private constructor(connectionString: string, private readonly options: NeonDatabaseOptions) {
    this.sql = neon(connectionString);
  }

  static async connect(
    connectionString: string,
    options: NeonDatabaseOptions,
    schemaConnectionString = connectionString
  ): Promise<NeonDatabase> {
    const database = new NeonDatabase(connectionString, options);
    await database.migrate(schemaConnectionString);
    await database.load();
    database.deleteExpiredPending();
    database.deleteExpiredReviewSessions();
    database.capReviewSessions();
    database.enqueue(
      "DELETE FROM audit_log WHERE created_at < $1",
      [Date.now() - options.auditRetentionDays * 24 * 60 * 60 * 1000]
    );
    database.enqueue(
      "DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT 20000)"
    );
    database.enqueue(
      "DELETE FROM daily_puzzles WHERE status = 'completed' AND ends_at < $1",
      [Date.now() - 30 * 24 * 60 * 60 * 1000]
    );
    await database.flush();
    return database;
  }

  private async migrate(connectionString: string): Promise<void> {
    const schemaSql = neon(connectionString);
    await schemaSql.transaction((tx) => [
      tx`CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        verified_role_id TEXT NOT NULL,
        review_role_id TEXT NOT NULL,
        onboarding_category_id TEXT NOT NULL,
        rules_channel_id TEXT NOT NULL,
        verify_channel_id TEXT NOT NULL,
        log_channel_id TEXT NOT NULL,
        analysis_channel_id TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      tx`CREATE TABLE IF NOT EXISTS links (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        chess_player_id BIGINT NOT NULL,
        chess_username TEXT NOT NULL,
        linked_at BIGINT NOT NULL,
        verified_via TEXT NOT NULL,
        account_status TEXT NOT NULL,
        last_checked_at BIGINT,
        last_stats_json TEXT,
        last_analyzed_game_url TEXT,
        PRIMARY KEY (guild_id, discord_user_id),
        UNIQUE (guild_id, chess_player_id)
      )`,
      tx`CREATE TABLE IF NOT EXISTS pending_verifications (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        chess_username TEXT NOT NULL,
        chess_player_id BIGINT NOT NULL,
        challenge_code TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      )`,
      tx`CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        discord_user_id TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      tx`CREATE TABLE IF NOT EXISTS puzzle_sessions (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        puzzle_id TEXT NOT NULL,
        current_fen TEXT NOT NULL,
        solution_moves_json TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        puzzle_rating INTEGER NOT NULL,
        themes_json TEXT NOT NULL,
        user_color TEXT NOT NULL CHECK (user_color IN ('w', 'b')),
        failed_once BOOLEAN NOT NULL DEFAULT FALSE,
        started_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      )`,
      tx`CREATE TABLE IF NOT EXISTS puzzle_stats (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        rating INTEGER NOT NULL DEFAULT 1200,
        solved INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      )`,
      tx`CREATE TABLE IF NOT EXISTS review_sessions (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        result_gzip TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      )`,
      tx`CREATE TABLE IF NOT EXISTS daily_puzzle_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        interval_hours INTEGER NOT NULL CHECK (interval_hours IN (6, 12)),
        next_puzzle_at BIGINT NOT NULL
      )`,
      tx`CREATE TABLE IF NOT EXISTS daily_puzzles (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        puzzle_id TEXT NOT NULL,
        initial_fen TEXT NOT NULL,
        solution_moves_json TEXT NOT NULL,
        puzzle_rating INTEGER NOT NULL,
        themes_json TEXT NOT NULL,
        user_color TEXT NOT NULL CHECK (user_color IN ('w', 'b')),
        started_at BIGINT NOT NULL,
        ends_at BIGINT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed'))
      )`,
      tx`CREATE TABLE IF NOT EXISTS daily_puzzle_attempts (
        challenge_id TEXT NOT NULL REFERENCES daily_puzzles(id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        current_fen TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        mistakes INTEGER NOT NULL DEFAULT 0,
        solved_at BIGINT,
        started_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (challenge_id, discord_user_id)
      )`,
      tx`CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_verifications(expires_at)`,
      tx`CREATE INDEX IF NOT EXISTS idx_review_expiry ON review_sessions(expires_at)`,
      tx`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`,
      tx`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_puzzle_active ON daily_puzzles(guild_id) WHERE status = 'active'`,
      tx`CREATE INDEX IF NOT EXISTS idx_daily_puzzle_ends ON daily_puzzles(ends_at)`,
      tx`CREATE INDEX IF NOT EXISTS idx_daily_attempt_challenge ON daily_puzzle_attempts(challenge_id)`
    ]);
  }

  private async load(): Promise<void> {
    const results = await this.sql.transaction((tx) => [
      tx`SELECT * FROM guild_settings`,
      tx`SELECT * FROM links`,
      tx`SELECT * FROM pending_verifications`,
      tx`SELECT * FROM audit_log ORDER BY id DESC LIMIT 20000`,
      tx`SELECT * FROM puzzle_sessions`,
      tx`SELECT * FROM puzzle_stats`,
      tx`SELECT * FROM review_sessions`,
      tx`SELECT * FROM daily_puzzle_settings`,
      tx`SELECT * FROM daily_puzzles WHERE ends_at >= ${Date.now() - 30 * 24 * 60 * 60 * 1000}`,
      tx`SELECT attempts.* FROM daily_puzzle_attempts attempts
         JOIN daily_puzzles puzzles ON puzzles.id = attempts.challenge_id
         WHERE puzzles.ends_at >= ${Date.now() - 30 * 24 * 60 * 60 * 1000}`
    ], { readOnly: true });

    for (const row of results[0] as Row[]) {
      const settings: GuildSettings = {
        guildId: String(row.guild_id),
        verifiedRoleId: String(row.verified_role_id),
        reviewRoleId: String(row.review_role_id),
        onboardingCategoryId: String(row.onboarding_category_id),
        rulesChannelId: String(row.rules_channel_id),
        verifyChannelId: String(row.verify_channel_id),
        logChannelId: String(row.log_channel_id),
        analysisChannelId: String(row.analysis_channel_id)
      };
      this.guilds.set(settings.guildId, settings);
    }
    for (const row of results[1] as Row[]) {
      const link: LinkRecord = {
        guildId: String(row.guild_id),
        discordUserId: String(row.discord_user_id),
        chessPlayerId: numberValue(row.chess_player_id),
        chessUsername: String(row.chess_username),
        linkedAt: numberValue(row.linked_at),
        verifiedVia: String(row.verified_via),
        accountStatus: String(row.account_status),
        lastCheckedAt: nullableNumber(row.last_checked_at),
        lastStatsJson: row.last_stats_json === null ? null : String(row.last_stats_json),
        lastAnalyzedGameUrl: row.last_analyzed_game_url === null ? null : String(row.last_analyzed_game_url)
      };
      this.links.set(key(link.guildId, link.discordUserId), link);
      this.players.set(playerKey(link.guildId, link.chessPlayerId), link.discordUserId);
    }
    for (const row of results[2] as Row[]) {
      const item: PendingVerification = {
        guildId: String(row.guild_id),
        discordUserId: String(row.discord_user_id),
        chessUsername: String(row.chess_username),
        chessPlayerId: numberValue(row.chess_player_id),
        challengeCode: String(row.challenge_code),
        createdAt: numberValue(row.created_at),
        expiresAt: numberValue(row.expires_at)
      };
      this.pending.set(key(item.guildId, item.discordUserId), item);
    }
    for (const row of (results[3] as Row[]).reverse()) {
      const record: AuditLogRecord = {
        id: numberValue(row.id),
        guildId: String(row.guild_id),
        discordUserId: row.discord_user_id === null ? null : String(row.discord_user_id),
        action: String(row.action),
        details: String(row.details),
        createdAt: numberValue(row.created_at)
      };
      this.auditRecords.push(record);
      this.nextAuditId = Math.max(this.nextAuditId, record.id + 1);
    }
    for (const row of results[4] as Row[]) {
      const session: PuzzleSession = {
        guildId: String(row.guild_id),
        discordUserId: String(row.discord_user_id),
        puzzleId: String(row.puzzle_id),
        currentFen: String(row.current_fen),
        solutionMoves: JSON.parse(String(row.solution_moves_json)) as string[],
        currentIndex: numberValue(row.current_index),
        puzzleRating: numberValue(row.puzzle_rating),
        themes: JSON.parse(String(row.themes_json)) as string[],
        userColor: row.user_color === "b" ? "b" : "w",
        failedOnce: Boolean(row.failed_once),
        startedAt: numberValue(row.started_at)
      };
      this.puzzleSessions.set(key(session.guildId, session.discordUserId), session);
    }
    for (const row of results[5] as Row[]) {
      const stats: PuzzleStats = {
        guildId: String(row.guild_id),
        discordUserId: String(row.discord_user_id),
        rating: numberValue(row.rating),
        solved: numberValue(row.solved),
        failed: numberValue(row.failed),
        streak: numberValue(row.streak),
        bestStreak: numberValue(row.best_streak),
        updatedAt: numberValue(row.updated_at)
      };
      this.puzzleStats.set(key(stats.guildId, stats.discordUserId), stats);
    }
    for (const row of results[6] as Row[]) {
      const session: PersistedReviewSession = {
        id: String(row.id),
        guildId: String(row.guild_id),
        resultJson: decodeReview(String(row.result_gzip)),
        currentIndex: numberValue(row.current_index),
        content: String(row.content),
        expiresAt: numberValue(row.expires_at)
      };
      this.reviewSessions.set(session.id, session);
    }
    for (const row of results[7] as Row[]) {
      const intervalHours = numberValue(row.interval_hours);
      const settings: DailyPuzzleSettings = {
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        intervalHours: intervalHours === 6 ? 6 : 12,
        nextPuzzleAt: numberValue(row.next_puzzle_at)
      };
      this.dailyPuzzleSettings.set(settings.guildId, settings);
    }
    for (const row of results[8] as Row[]) {
      const challenge: DailyPuzzleChallenge = {
        id: String(row.id),
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        messageId: row.message_id === null ? null : String(row.message_id),
        puzzleId: String(row.puzzle_id),
        initialFen: String(row.initial_fen),
        solutionMoves: JSON.parse(String(row.solution_moves_json)) as string[],
        puzzleRating: numberValue(row.puzzle_rating),
        themes: JSON.parse(String(row.themes_json)) as string[],
        userColor: row.user_color === "b" ? "b" : "w",
        startedAt: numberValue(row.started_at),
        endsAt: numberValue(row.ends_at),
        status: row.status === "active" ? "active" : "completed"
      };
      this.dailyPuzzles.set(challenge.id, challenge);
    }
    for (const row of results[9] as Row[]) {
      const attempt: DailyPuzzleAttempt = {
        challengeId: String(row.challenge_id),
        guildId: String(row.guild_id),
        discordUserId: String(row.discord_user_id),
        currentFen: String(row.current_fen),
        currentIndex: numberValue(row.current_index),
        mistakes: numberValue(row.mistakes),
        solvedAt: nullableNumber(row.solved_at),
        startedAt: numberValue(row.started_at),
        updatedAt: numberValue(row.updated_at)
      };
      this.dailyPuzzleAttempts.set(key(attempt.challengeId, attempt.discordUserId), attempt);
    }
  }

  private enqueue(query: string, params: unknown[] = []): void {
    this.writeQueue = this.writeQueue
      .then(() => this.executeWithRetry(query, params))
      .catch((error: unknown) => {
        this.writeError = error;
        console.error("Neon database write failed", error);
      });
  }

  private async executeWithRetry(query: string, params: unknown[]): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.sql.query(query, params);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  upsertGuildSettings(settings: GuildSettings): void {
    this.guilds.set(settings.guildId, { ...settings });
    this.enqueue(`INSERT INTO guild_settings (
      guild_id, verified_role_id, review_role_id, onboarding_category_id, rules_channel_id,
      verify_channel_id, log_channel_id, analysis_channel_id, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (guild_id) DO UPDATE SET verified_role_id=EXCLUDED.verified_role_id,
      review_role_id=EXCLUDED.review_role_id, onboarding_category_id=EXCLUDED.onboarding_category_id,
      rules_channel_id=EXCLUDED.rules_channel_id, verify_channel_id=EXCLUDED.verify_channel_id,
      log_channel_id=EXCLUDED.log_channel_id, analysis_channel_id=EXCLUDED.analysis_channel_id`, [
      settings.guildId, settings.verifiedRoleId, settings.reviewRoleId, settings.onboardingCategoryId,
      settings.rulesChannelId, settings.verifyChannelId, settings.logChannelId, settings.analysisChannelId, Date.now()
    ]);
  }

  getGuildSettings(guildId: string): GuildSettings | null {
    const value = this.guilds.get(guildId);
    return value ? { ...value } : null;
  }

  listGuildSettings(): GuildSettings[] {
    return [...this.guilds.values()].map((value) => ({ ...value })).sort((a, b) => a.guildId.localeCompare(b.guildId));
  }

  savePending(pending: PendingVerification): void {
    this.pending.set(key(pending.guildId, pending.discordUserId), { ...pending });
    this.enqueue(`INSERT INTO pending_verifications
      (guild_id,discord_user_id,chess_username,chess_player_id,challenge_code,created_at,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (guild_id,discord_user_id) DO UPDATE SET
      chess_username=EXCLUDED.chess_username,chess_player_id=EXCLUDED.chess_player_id,
      challenge_code=EXCLUDED.challenge_code,created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at`, [
      pending.guildId, pending.discordUserId, pending.chessUsername, pending.chessPlayerId,
      pending.challengeCode, pending.createdAt, pending.expiresAt
    ]);
  }

  getPending(guildId: string, discordUserId: string): PendingVerification | null {
    const value = this.pending.get(key(guildId, discordUserId));
    return value ? { ...value } : null;
  }

  listPending(): PendingVerification[] {
    return [...this.pending.values()].map((value) => ({ ...value })).sort((a, b) => a.createdAt - b.createdAt);
  }

  deletePending(guildId: string, discordUserId: string): void {
    this.pending.delete(key(guildId, discordUserId));
    this.enqueue("DELETE FROM pending_verifications WHERE guild_id=$1 AND discord_user_id=$2", [guildId, discordUserId]);
  }

  deleteExpiredPending(now = Date.now()): number {
    let deleted = 0;
    for (const [itemKey, item] of this.pending) {
      if (item.expiresAt < now) {
        this.pending.delete(itemKey);
        deleted += 1;
      }
    }
    if (deleted > 0) this.enqueue("DELETE FROM pending_verifications WHERE expires_at < $1", [now]);
    return deleted;
  }

  getLinkByDiscord(guildId: string, discordUserId: string): LinkRecord | null {
    const value = this.links.get(key(guildId, discordUserId));
    return value ? { ...value } : null;
  }

  getLinkByChessPlayer(guildId: string, chessPlayerId: number): LinkRecord | null {
    const userId = this.players.get(playerKey(guildId, chessPlayerId));
    return userId ? this.getLinkByDiscord(guildId, userId) : null;
  }

  createLink(link: LinkRecord): void {
    const userKey = key(link.guildId, link.discordUserId);
    const chessKey = playerKey(link.guildId, link.chessPlayerId);
    if (this.links.has(userKey) || this.players.has(chessKey)) throw new Error("Account link already exists");
    this.links.set(userKey, { ...link });
    this.players.set(chessKey, link.discordUserId);
    this.pending.delete(userKey);
    this.enqueue(`INSERT INTO links (guild_id,discord_user_id,chess_player_id,chess_username,linked_at,
      verified_via,account_status,last_checked_at,last_stats_json,last_analyzed_game_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      link.guildId, link.discordUserId, link.chessPlayerId, link.chessUsername, link.linkedAt,
      link.verifiedVia, link.accountStatus, link.lastCheckedAt, link.lastStatsJson, link.lastAnalyzedGameUrl
    ]);
    this.enqueue("DELETE FROM pending_verifications WHERE guild_id=$1 AND discord_user_id=$2", [link.guildId, link.discordUserId]);
  }

  updateLinkCheck(guildId: string, discordUserId: string, chessUsername: string, status: string, statsJson: string | null): void {
    const userKey = key(guildId, discordUserId);
    const value = this.links.get(userKey);
    if (!value) return;
    const updated = { ...value, chessUsername, accountStatus: status, lastCheckedAt: Date.now(), lastStatsJson: statsJson };
    this.links.set(userKey, updated);
    this.enqueue(`UPDATE links SET chess_username=$1,account_status=$2,last_checked_at=$3,last_stats_json=$4
      WHERE guild_id=$5 AND discord_user_id=$6`, [chessUsername, status, updated.lastCheckedAt, statsJson, guildId, discordUserId]);
  }

  listLinks(guildId?: string): LinkRecord[] {
    return [...this.links.values()]
      .filter((value) => !guildId || value.guildId === guildId)
      .map((value) => ({ ...value }))
      .sort((a, b) => a.guildId.localeCompare(b.guildId) || a.linkedAt - b.linkedAt);
  }

  deleteLink(guildId: string, discordUserId: string): boolean {
    const userKey = key(guildId, discordUserId);
    const value = this.links.get(userKey);
    if (!value) return false;
    this.links.delete(userKey);
    this.players.delete(playerKey(guildId, value.chessPlayerId));
    this.enqueue("DELETE FROM links WHERE guild_id=$1 AND discord_user_id=$2", [guildId, discordUserId]);
    return true;
  }

  updateLastAnalyzedGame(guildId: string, discordUserId: string, gameUrl: string): void {
    const userKey = key(guildId, discordUserId);
    const value = this.links.get(userKey);
    if (!value) return;
    this.links.set(userKey, { ...value, lastAnalyzedGameUrl: gameUrl });
    this.enqueue("UPDATE links SET last_analyzed_game_url=$1 WHERE guild_id=$2 AND discord_user_id=$3", [gameUrl, guildId, discordUserId]);
  }

  audit(guildId: string, discordUserId: string | null, action: string, details: unknown): void {
    const record: AuditLogRecord = {
      id: this.nextAuditId++, guildId, discordUserId, action,
      details: JSON.stringify(details), createdAt: Date.now()
    };
    this.auditRecords.push(record);
    if (this.auditRecords.length > 20_000) this.auditRecords.splice(0, this.auditRecords.length - 20_000);
    this.enqueue("INSERT INTO audit_log (guild_id,discord_user_id,action,details,created_at) VALUES ($1,$2,$3,$4,$5)",
      [guildId, discordUserId, action, record.details, record.createdAt]);
  }

  listAuditLog(limit = 5_000): AuditLogRecord[] {
    const safeLimit = Math.max(1, Math.min(20_000, Math.trunc(limit)));
    return this.auditRecords.slice(-safeLimit).map((value) => ({ ...value }));
  }

  savePuzzleSession(session: PuzzleSession): void {
    this.puzzleSessions.set(key(session.guildId, session.discordUserId), clonePuzzleSession(session));
    this.enqueue(`INSERT INTO puzzle_sessions (guild_id,discord_user_id,puzzle_id,current_fen,solution_moves_json,
      current_index,puzzle_rating,themes_json,user_color,failed_once,started_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (guild_id,discord_user_id) DO UPDATE SET
      puzzle_id=EXCLUDED.puzzle_id,current_fen=EXCLUDED.current_fen,solution_moves_json=EXCLUDED.solution_moves_json,
      current_index=EXCLUDED.current_index,puzzle_rating=EXCLUDED.puzzle_rating,themes_json=EXCLUDED.themes_json,
      user_color=EXCLUDED.user_color,failed_once=EXCLUDED.failed_once,started_at=EXCLUDED.started_at`, [
      session.guildId, session.discordUserId, session.puzzleId, session.currentFen, JSON.stringify(session.solutionMoves),
      session.currentIndex, session.puzzleRating, JSON.stringify(session.themes), session.userColor, session.failedOnce, session.startedAt
    ]);
  }

  getPuzzleSession(guildId: string, discordUserId: string): PuzzleSession | null {
    const value = this.puzzleSessions.get(key(guildId, discordUserId));
    return value ? clonePuzzleSession(value) : null;
  }

  listPuzzleSessions(): PuzzleSession[] {
    return [...this.puzzleSessions.values()].map(clonePuzzleSession).sort((a, b) => a.startedAt - b.startedAt);
  }

  deletePuzzleSession(guildId: string, discordUserId: string): void {
    this.puzzleSessions.delete(key(guildId, discordUserId));
    this.enqueue("DELETE FROM puzzle_sessions WHERE guild_id=$1 AND discord_user_id=$2", [guildId, discordUserId]);
  }

  getPuzzleStats(guildId: string, discordUserId: string): PuzzleStats {
    const value = this.puzzleStats.get(key(guildId, discordUserId));
    return value ? { ...value } : {
      guildId, discordUserId, rating: 1200, solved: 0, failed: 0, streak: 0, bestStreak: 0, updatedAt: Date.now()
    };
  }

  savePuzzleStats(stats: PuzzleStats): void {
    this.puzzleStats.set(key(stats.guildId, stats.discordUserId), { ...stats });
    this.enqueue(`INSERT INTO puzzle_stats (guild_id,discord_user_id,rating,solved,failed,streak,best_streak,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (guild_id,discord_user_id) DO UPDATE SET
      rating=EXCLUDED.rating,solved=EXCLUDED.solved,failed=EXCLUDED.failed,streak=EXCLUDED.streak,
      best_streak=EXCLUDED.best_streak,updated_at=EXCLUDED.updated_at`, [stats.guildId, stats.discordUserId,
      stats.rating, stats.solved, stats.failed, stats.streak, stats.bestStreak, stats.updatedAt]);
  }

  listPuzzleStats(guildId: string): PuzzleStats[] {
    return [...this.puzzleStats.values()].filter((value) => value.guildId === guildId)
      .sort((a, b) => b.rating - a.rating || b.solved - a.solved).slice(0, 20).map((value) => ({ ...value }));
  }

  listAllPuzzleStats(): PuzzleStats[] {
    return [...this.puzzleStats.values()].sort((a, b) => a.guildId.localeCompare(b.guildId) || b.rating - a.rating || b.solved - a.solved)
      .map((value) => ({ ...value }));
  }

  saveReviewSession(session: PersistedReviewSession): void {
    this.reviewSessions.set(session.id, { ...session });
    this.enqueue(`INSERT INTO review_sessions (id,guild_id,result_gzip,current_index,content,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET guild_id=EXCLUDED.guild_id,
      result_gzip=EXCLUDED.result_gzip,current_index=EXCLUDED.current_index,content=EXCLUDED.content,expires_at=EXCLUDED.expires_at`,
    [session.id, session.guildId, encodeReview(session.resultJson), session.currentIndex, session.content, session.expiresAt]);
  }

  getReviewSession(id: string, guildId: string): PersistedReviewSession | null {
    const value = this.reviewSessions.get(id);
    return value?.guildId === guildId ? { ...value } : null;
  }

  listReviewSessions(): PersistedReviewSession[] {
    return [...this.reviewSessions.values()].map((value) => ({ ...value })).sort((a, b) => a.expiresAt - b.expiresAt);
  }

  updateReviewSessionIndex(id: string, guildId: string, currentIndex: number): void {
    const value = this.reviewSessions.get(id);
    if (!value || value.guildId !== guildId) return;
    this.reviewSessions.set(id, { ...value, currentIndex });
    this.enqueue("UPDATE review_sessions SET current_index=$1 WHERE id=$2 AND guild_id=$3", [currentIndex, id, guildId]);
  }

  deleteExpiredReviewSessions(now = Date.now()): number {
    let deleted = 0;
    for (const [id, session] of this.reviewSessions) {
      if (session.expiresAt < now) {
        this.reviewSessions.delete(id);
        deleted += 1;
      }
    }
    if (deleted > 0) this.enqueue("DELETE FROM review_sessions WHERE expires_at < $1", [now]);
    return deleted;
  }

  private capReviewSessions(maxSessions = 500): void {
    if (this.reviewSessions.size > maxSessions) {
      const keep = new Set(
        [...this.reviewSessions.values()]
          .sort((a, b) => b.expiresAt - a.expiresAt)
          .slice(0, maxSessions)
          .map((session) => session.id)
      );
      for (const id of this.reviewSessions.keys()) {
        if (!keep.has(id)) this.reviewSessions.delete(id);
      }
    }
    this.enqueue(`DELETE FROM review_sessions WHERE id NOT IN (
      SELECT id FROM review_sessions ORDER BY expires_at DESC LIMIT $1
    )`, [maxSessions]);
  }

  upsertDailyPuzzleSettings(settings: DailyPuzzleSettings): void {
    this.dailyPuzzleSettings.set(settings.guildId, { ...settings });
    this.enqueue(`INSERT INTO daily_puzzle_settings (guild_id,channel_id,interval_hours,next_puzzle_at)
      VALUES ($1,$2,$3,$4) ON CONFLICT (guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,
      interval_hours=EXCLUDED.interval_hours,next_puzzle_at=EXCLUDED.next_puzzle_at`,
    [settings.guildId, settings.channelId, settings.intervalHours, settings.nextPuzzleAt]);
  }

  getDailyPuzzleSettings(guildId: string): DailyPuzzleSettings | null {
    const value = this.dailyPuzzleSettings.get(guildId);
    return value ? { ...value } : null;
  }

  listDailyPuzzleSettings(): DailyPuzzleSettings[] {
    return [...this.dailyPuzzleSettings.values()].map((value) => ({ ...value }));
  }

  async createDailyPuzzle(challenge: DailyPuzzleChallenge): Promise<boolean> {
    await this.flush();
    const rows = await this.sql.query(`INSERT INTO daily_puzzles (
      id,guild_id,channel_id,message_id,puzzle_id,initial_fen,solution_moves_json,puzzle_rating,
      themes_json,user_color,started_at,ends_at,status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT DO NOTHING RETURNING id`, [
      challenge.id, challenge.guildId, challenge.channelId, challenge.messageId, challenge.puzzleId,
      challenge.initialFen, JSON.stringify(challenge.solutionMoves), challenge.puzzleRating,
      JSON.stringify(challenge.themes), challenge.userColor, challenge.startedAt, challenge.endsAt, challenge.status
    ]);
    if (rows.length === 0) return false;
    this.dailyPuzzles.set(challenge.id, cloneDailyPuzzle(challenge));
    return true;
  }

  saveDailyPuzzle(challenge: DailyPuzzleChallenge): void {
    this.dailyPuzzles.set(challenge.id, cloneDailyPuzzle(challenge));
    this.enqueue(`INSERT INTO daily_puzzles (
      id,guild_id,channel_id,message_id,puzzle_id,initial_fen,solution_moves_json,puzzle_rating,
      themes_json,user_color,started_at,ends_at,status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET channel_id=EXCLUDED.channel_id,message_id=EXCLUDED.message_id,
      ends_at=EXCLUDED.ends_at,status=EXCLUDED.status`, [
      challenge.id, challenge.guildId, challenge.channelId, challenge.messageId, challenge.puzzleId,
      challenge.initialFen, JSON.stringify(challenge.solutionMoves), challenge.puzzleRating,
      JSON.stringify(challenge.themes), challenge.userColor, challenge.startedAt, challenge.endsAt, challenge.status
    ]);
  }

  getDailyPuzzle(id: string, guildId: string): DailyPuzzleChallenge | null {
    const value = this.dailyPuzzles.get(id);
    return value?.guildId === guildId ? cloneDailyPuzzle(value) : null;
  }

  getActiveDailyPuzzle(guildId: string): DailyPuzzleChallenge | null {
    const value = [...this.dailyPuzzles.values()].find(
      (challenge) => challenge.guildId === guildId && challenge.status === "active"
    );
    return value ? cloneDailyPuzzle(value) : null;
  }

  async completeDailyPuzzle(id: string, guildId: string): Promise<boolean> {
    await this.flush();
    const rows = await this.sql.query(
      "UPDATE daily_puzzles SET status='completed' WHERE id=$1 AND guild_id=$2 AND status='active' RETURNING id",
      [id, guildId]
    );
    const value = this.dailyPuzzles.get(id);
    if (value) this.dailyPuzzles.set(id, { ...value, status: "completed" });
    return rows.length > 0;
  }

  getDailyPuzzleAttempt(challengeId: string, discordUserId: string): DailyPuzzleAttempt | null {
    const value = this.dailyPuzzleAttempts.get(key(challengeId, discordUserId));
    return value ? { ...value } : null;
  }

  saveDailyPuzzleAttempt(attempt: DailyPuzzleAttempt): void {
    this.dailyPuzzleAttempts.set(key(attempt.challengeId, attempt.discordUserId), { ...attempt });
    this.enqueue(`INSERT INTO daily_puzzle_attempts (
      challenge_id,guild_id,discord_user_id,current_fen,current_index,mistakes,solved_at,started_at,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (challenge_id,discord_user_id) DO UPDATE SET current_fen=EXCLUDED.current_fen,
      current_index=EXCLUDED.current_index,mistakes=EXCLUDED.mistakes,solved_at=EXCLUDED.solved_at,
      updated_at=EXCLUDED.updated_at`, [attempt.challengeId, attempt.guildId, attempt.discordUserId,
      attempt.currentFen, attempt.currentIndex, attempt.mistakes, attempt.solvedAt, attempt.startedAt, attempt.updatedAt]);
  }

  listDailyPuzzleAttempts(challengeId: string): DailyPuzzleAttempt[] {
    return [...this.dailyPuzzleAttempts.values()]
      .filter((attempt) => attempt.challengeId === challengeId)
      .sort((a, b) => (a.solvedAt ?? Number.MAX_SAFE_INTEGER) - (b.solvedAt ?? Number.MAX_SAFE_INTEGER) || a.mistakes - b.mistakes)
      .map((attempt) => ({ ...attempt }));
  }

  async getCounts(): Promise<DatabaseCounts> {
    const rows = await this.sql.query(`SELECT
      (SELECT COUNT(*) FROM guild_settings) AS guild_settings,
      (SELECT COUNT(*) FROM links) AS links,
      (SELECT COUNT(*) FROM pending_verifications) AS pending_verifications,
      (SELECT COUNT(*) FROM audit_log) AS audit_records,
      (SELECT COUNT(*) FROM puzzle_sessions) AS puzzle_sessions,
      (SELECT COUNT(*) FROM puzzle_stats) AS puzzle_stats,
      (SELECT COUNT(*) FROM review_sessions) AS review_sessions,
      (SELECT COUNT(*) FROM daily_puzzle_settings) AS daily_puzzle_settings,
      (SELECT COUNT(*) FROM daily_puzzles) AS daily_puzzles,
      (SELECT COUNT(*) FROM daily_puzzle_attempts) AS daily_puzzle_attempts`);
    const row = rows[0] as Row;
    return {
      guildSettings: numberValue(row.guild_settings), links: numberValue(row.links),
      pendingVerifications: numberValue(row.pending_verifications), auditRecords: numberValue(row.audit_records),
      puzzleSessions: numberValue(row.puzzle_sessions), puzzleStats: numberValue(row.puzzle_stats),
      reviewSessions: numberValue(row.review_sessions),
      dailyPuzzleSettings: numberValue(row.daily_puzzle_settings),
      dailyPuzzles: numberValue(row.daily_puzzles),
      dailyPuzzleAttempts: numberValue(row.daily_puzzle_attempts)
    };
  }

  async importFromSQLite(source: AppDatabase): Promise<void> {
    const counts = await this.getCounts();
    if (Object.values(counts).some((count) => count > 0)) {
      throw new Error("Neon database is not empty; migration was stopped to avoid duplicate data");
    }
    for (const settings of source.listGuildSettings()) this.upsertGuildSettings(settings);
    for (const link of source.listLinks()) {
      let lastStatsJson = link.lastStatsJson;
      if (lastStatsJson) {
        try {
          lastStatsJson = compactStatsJson(JSON.parse(lastStatsJson));
        } catch {
          lastStatsJson = null;
        }
      }
      this.createLink({ ...link, lastStatsJson });
    }
    for (const pending of source.listPending()) this.savePending(pending);
    for (const session of source.listPuzzleSessions()) this.savePuzzleSession(session);
    for (const stats of source.listAllPuzzleStats()) this.savePuzzleStats(stats);
    for (const session of source.listReviewSessions()) this.saveReviewSession(session);
    for (const record of source.listAuditLog(20_000)) {
      this.enqueue("INSERT INTO audit_log (guild_id,discord_user_id,action,details,created_at) VALUES ($1,$2,$3,$4,$5)",
        [record.guildId, record.discordUserId, record.action, record.details, record.createdAt]);
    }
    await this.flush();
    await this.loadFreshAuditRecords();
  }

  private async loadFreshAuditRecords(): Promise<void> {
    const rows = await this.sql.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 20000");
    this.auditRecords.length = 0;
    for (const row of (rows as Row[]).reverse()) {
      const record: AuditLogRecord = {
        id: numberValue(row.id), guildId: String(row.guild_id),
        discordUserId: row.discord_user_id === null ? null : String(row.discord_user_id),
        action: String(row.action), details: String(row.details), createdAt: numberValue(row.created_at)
      };
      this.auditRecords.push(record);
      this.nextAuditId = Math.max(this.nextAuditId, record.id + 1);
    }
  }

  async flush(): Promise<void> {
    await this.writeQueue;
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = null;
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }
}
