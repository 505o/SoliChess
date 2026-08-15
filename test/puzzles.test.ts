import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderBoard } from "../src/board-renderer.js";
import type { LichessPuzzle } from "../src/lichess-puzzles.js";
import { sessionFromPuzzle, submitPuzzleMove, updatedPuzzleRating } from "../src/puzzles.js";

const puzzle: LichessPuzzle = {
  id: "FeEXP",
  rating: 1843,
  plays: 95_006,
  fen: "rnbq1rk1/pppp1ppp/8/2b5/2B5/1N6/PPP2RPP/RNBQ2K1 b - - 0 1",
  lastMove: "f1f2",
  solution: ["c5f2", "g1f2", "d8h4", "f2g1", "h4c4"],
  themes: ["advantage", "attraction", "fork", "long", "opening"]
};

test("puzzle session applies the forced opponent response", () => {
  const session = sessionFromPuzzle("guild", "user", puzzle);
  const result = submitPuzzleMove(session, "c5f2");
  assert.equal(result.kind, "continue");
  assert.equal(result.playedSan, "Bxf2+");
  assert.equal(result.opponentSan, "Kxf2");
  assert.equal(result.session.currentIndex, 2);
  assert.equal(result.session.currentFen.split(" ")[1], "b");
});

test("wrong legal puzzle moves mark the session as failed", () => {
  const session = sessionFromPuzzle("guild", "user", puzzle);
  const result = submitPuzzleMove(session, "d7d6");
  assert.equal(result.kind, "wrong");
  assert.equal(result.session.failedOnce, true);
  assert.equal(result.session.currentFen, session.currentFen);
});

test("lowercase piece notation is accepted when the intended SAN move is clear", () => {
  const lowercasePuzzle: LichessPuzzle = {
    id: "m534y",
    rating: 1200,
    plays: 1,
    fen: "1r2r1k1/p3qppp/2p5/2B5/8/1PbP1P2/P1P1RQPP/4R2K b - - 0 24",
    lastMove: "",
    solution: ["c3e1", "e2e7", "e1f2"],
    themes: ["short"]
  };
  const result = submitPuzzleMove(sessionFromPuzzle("guild", "user", lowercasePuzzle), "bxe1");
  assert.equal(result.kind, "continue");
  assert.equal(result.playedSan, "Bxe1");
});

test("puzzle rating moves in the expected direction", () => {
  assert.ok(updatedPuzzleRating(1200, 1500, true) > 1200);
  assert.ok(updatedPuzzleRating(1200, 1500, false) < 1200);
});

test("board renderer produces a PNG", async () => {
  const board = await renderBoard(puzzle.fen, "b", puzzle.lastMove);
  assert.equal(board.subarray(1, 4).toString(), "PNG");
  assert.ok(board.length > 10_000);
  const metadata = await sharp(board).metadata();
  assert.equal(metadata.width, 1184);
  assert.equal(metadata.height, 1120);
});
