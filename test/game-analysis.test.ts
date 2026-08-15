import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCompletedGame, classifyLoss } from "../src/game-analysis.js";
import { StockfishEngine } from "../src/stockfish.js";
import type { ChessComGame } from "../src/types.js";

test("move loss classification uses SoliChess thresholds", () => {
  assert.equal(classifyLoss(0, "e2e4", "e2e4"), "best");
  assert.equal(classifyLoss(40, "d2d4", "e2e4"), "excellent");
  assert.equal(classifyLoss(90, "d2d4", "e2e4"), "inaccuracy");
  assert.equal(classifyLoss(180, "d2d4", "e2e4"), "mistake");
  assert.equal(classifyLoss(400, "d2d4", "e2e4"), "blunder");
});

test("Stockfish analyzes a completed game and reports the requested player", async () => {
  const game: ChessComGame = {
    url: "https://www.chess.com/game/test",
    pgn: `[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`,
    end_time: 1,
    time_class: "blitz",
    time_control: "300",
    rules: "chess",
    white: { username: "Alice", rating: 1200, result: "checkmated" },
    black: { username: "Bob", rating: 1200, result: "win" }
  };
  const result = await analyzeCompletedGame(game, "Alice", new StockfishEngine(), 5);
  assert.equal(result.username, "Alice");
  assert.equal(result.opponent, "Bob");
  assert.equal(result.color, "w");
  assert.equal(result.moveCount, 2);
  assert.ok(result.counts.blunder >= 1);
  assert.ok(result.whiteEvaluations.length === 5);
});
