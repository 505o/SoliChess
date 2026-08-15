import type { AuditLogRecord, PersistedReviewSession } from "./database.js";
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

export interface BotDatabase {
  upsertGuildSettings(settings: GuildSettings): void;
  getGuildSettings(guildId: string): GuildSettings | null;
  listGuildSettings(): GuildSettings[];
  savePending(pending: PendingVerification): void;
  getPending(guildId: string, discordUserId: string): PendingVerification | null;
  listPending(): PendingVerification[];
  deletePending(guildId: string, discordUserId: string): void;
  deleteExpiredPending(now?: number): number;
  getLinkByDiscord(guildId: string, discordUserId: string): LinkRecord | null;
  getLinkByChessPlayer(guildId: string, chessPlayerId: number): LinkRecord | null;
  createLink(link: LinkRecord): void;
  updateLinkCheck(guildId: string, discordUserId: string, chessUsername: string, status: string, statsJson: string | null): void;
  listLinks(guildId?: string): LinkRecord[];
  deleteLink(guildId: string, discordUserId: string): boolean;
  updateLastAnalyzedGame(guildId: string, discordUserId: string, gameUrl: string): void;
  audit(guildId: string, discordUserId: string | null, action: string, details: unknown): void;
  listAuditLog(limit?: number): AuditLogRecord[];
  savePuzzleSession(session: PuzzleSession): void;
  getPuzzleSession(guildId: string, discordUserId: string): PuzzleSession | null;
  listPuzzleSessions(): PuzzleSession[];
  deletePuzzleSession(guildId: string, discordUserId: string): void;
  getPuzzleStats(guildId: string, discordUserId: string): PuzzleStats;
  savePuzzleStats(stats: PuzzleStats): void;
  listPuzzleStats(guildId: string): PuzzleStats[];
  listAllPuzzleStats(): PuzzleStats[];
  saveReviewSession(session: PersistedReviewSession): void;
  getReviewSession(id: string, guildId: string): PersistedReviewSession | null;
  listReviewSessions(): PersistedReviewSession[];
  updateReviewSessionIndex(id: string, guildId: string, currentIndex: number): void;
  deleteExpiredReviewSessions(now?: number): number;
  upsertDailyPuzzleSettings(settings: DailyPuzzleSettings): void;
  getDailyPuzzleSettings(guildId: string): DailyPuzzleSettings | null;
  listDailyPuzzleSettings(): DailyPuzzleSettings[];
  createDailyPuzzle(challenge: DailyPuzzleChallenge): Promise<boolean>;
  saveDailyPuzzle(challenge: DailyPuzzleChallenge): void;
  getDailyPuzzle(id: string, guildId: string): DailyPuzzleChallenge | null;
  getActiveDailyPuzzle(guildId: string): DailyPuzzleChallenge | null;
  completeDailyPuzzle(id: string, guildId: string): Promise<boolean>;
  getDailyPuzzleAttempt(challengeId: string, discordUserId: string): DailyPuzzleAttempt | null;
  saveDailyPuzzleAttempt(attempt: DailyPuzzleAttempt): void;
  listDailyPuzzleAttempts(challengeId: string): DailyPuzzleAttempt[];
  flush(): Promise<void>;
  close(): void | Promise<void>;
}
