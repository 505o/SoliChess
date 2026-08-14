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
      lastStatsJson: null
    });

    assert.equal(database.getLinkByDiscord("guild-1", "discord-1")?.chessPlayerId, 101);
    assert.equal(database.getLinkByChessPlayer("guild-1", 101)?.discordUserId, "discord-1");

    assert.throws(() => database.createLink({
      guildId: "guild-1",
      discordUserId: "discord-2",
      chessPlayerId: 101,
      chessUsername: "PlayerOne",
      linkedAt: 2,
      verifiedVia: "test",
      accountStatus: "basic",
      lastCheckedAt: 2,
      lastStatsJson: null
    }));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
