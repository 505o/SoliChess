import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AppDatabase } from "../src/database.js";

test("database enforces one Discord and one Chess.com account per guild", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-gate-test-"));
  const database = new AppDatabase(path.join(directory, "test.db"));

  try {
    database.createLink({
      guildId: "guild-1",
      discordUserId: "discord-1",
      chessPlayerId: 101,
      chessUsername: "PlayerOne",
      linkedAt: 1,
      verifiedVia: "test",
      accountStatus: "basic",
      lastCheckedAt: 1,
      lastStatsJson: null,
      lastAnalyzedGameUrl: null
    });

    assert.equal(database.getLinkByDiscord("guild-1", "discord-1")?.chessPlayerId, 101);
    assert.equal(database.getLinkByChessPlayer("guild-1", 101)?.discordUserId, "discord-1");
    database.audit("guild-1", "discord-1", "test_action", { safe: true });
    assert.equal(database.listAuditLog()[0]?.action, "test_action");

    assert.throws(() => database.createLink({
      guildId: "guild-1",
      discordUserId: "discord-2",
      chessPlayerId: 101,
      chessUsername: "PlayerOne",
      linkedAt: 2,
      verifiedVia: "test",
      accountStatus: "basic",
      lastCheckedAt: 2,
      lastStatsJson: null,
      lastAnalyzedGameUrl: null
    }));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database persists puzzle sessions and stats", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-gate-puzzle-test-"));
  const database = new AppDatabase(path.join(directory, "test.db"));
  try {
    database.savePuzzleSession({
      guildId: "guild-1",
      discordUserId: "discord-1",
      puzzleId: "puzzle-1",
      currentFen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
      solutionMoves: ["e2e3"],
      currentIndex: 0,
      puzzleRating: 1400,
      themes: ["endgame"],
      userColor: "w",
      failedOnce: false,
      startedAt: 1
    });
    assert.equal(database.getPuzzleSession("guild-1", "discord-1")?.puzzleId, "puzzle-1");

    const stats = database.getPuzzleStats("guild-1", "discord-1");
    stats.rating = 1216;
    stats.solved = 1;
    let reportableChanges = 0;
    database.onReportableChange(() => { reportableChanges += 1; });
    database.savePuzzleStats(stats);
    assert.equal(database.getPuzzleStats("guild-1", "discord-1").rating, 1216);
    assert.equal(database.listPuzzleStats("guild-1")[0]?.solved, 1);
    assert.equal(database.listAllPuzzleStats()[0]?.discordUserId, "discord-1");
    assert.equal(reportableChanges, 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database persists interactive review sessions across restarts", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-gate-review-test-"));
  const databasePath = path.join(directory, "test.db");
  const first = new AppDatabase(databasePath);
  try {
    first.saveReviewSession({
      id: "abcdef123456",
      guildId: "guild-1",
      resultJson: JSON.stringify({ moves: [{ playedSan: "e4" }] }),
      currentIndex: 0,
      content: "review",
      expiresAt: 10_000
    });
  } finally {
    first.close();
  }

  const reopened = new AppDatabase(databasePath);
  try {
    assert.equal(reopened.getReviewSession("abcdef123456", "guild-1")?.content, "review");
    reopened.updateReviewSessionIndex("abcdef123456", "guild-1", 1);
    assert.equal(reopened.getReviewSession("abcdef123456", "guild-1")?.currentIndex, 1);
    assert.equal(reopened.deleteExpiredReviewSessions(10_001), 1);
    assert.equal(reopened.getReviewSession("abcdef123456", "guild-1"), null);
  } finally {
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database stores one active daily puzzle and private attempts", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chess-gate-daily-test-"));
  const database = new AppDatabase(path.join(directory, "test.db"));
  const challenge = {
    id: "daily0000001",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: null,
    puzzleId: "puzzle-1",
    initialFen: "8/8/8/8/8/8/4K3/7k w - - 0 1",
    solutionMoves: ["e2e3"],
    puzzleRating: 1400,
    themes: ["endgame"],
    userColor: "w" as const,
    startedAt: 1,
    endsAt: 100,
    status: "active" as const
  };
  try {
    database.upsertDailyPuzzleSettings({ guildId: "guild-1", channelId: "channel-1", intervalHours: 6, nextPuzzleAt: 1 });
    assert.equal(database.getDailyPuzzleSettings("guild-1")?.intervalHours, 6);
    assert.equal(await database.createDailyPuzzle(challenge), true);
    assert.equal(await database.createDailyPuzzle({ ...challenge, id: "daily0000002" }), false);

    database.saveDailyPuzzleAttempt({
      challengeId: challenge.id,
      guildId: challenge.guildId,
      discordUserId: "user-1",
      currentFen: challenge.initialFen,
      currentIndex: 0,
      mistakes: 2,
      solvedAt: null,
      startedAt: 2,
      updatedAt: 3
    });
    assert.equal(database.getDailyPuzzleAttempt(challenge.id, "user-1")?.mistakes, 2);
    assert.equal(database.listDailyPuzzleAttempts(challenge.id).length, 1);
    assert.equal(await database.completeDailyPuzzle(challenge.id, challenge.guildId), true);
    assert.equal(database.getActiveDailyPuzzle(challenge.guildId), null);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
