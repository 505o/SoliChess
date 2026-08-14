import assert from "node:assert/strict";
import test from "node:test";
import { isClosedStatus, isFairPlayClosure, ratingSnapshot } from "../src/chesscom.js";

test("ratingSnapshot extracts supported ratings", () => {
  assert.deepEqual(
    ratingSnapshot({
      chess_rapid: { last: { rating: 1501, date: 1 } },
      chess_blitz: { last: { rating: 1402, date: 1 } }
    }),
    { rapid: 1501, blitz: 1402, bullet: null }
  );
});

test("closure helpers distinguish fair-play status", () => {
  assert.equal(isClosedStatus("closed"), true);
  assert.equal(isClosedStatus("closed:fair_play_violations"), true);
  assert.equal(isClosedStatus("premium"), false);
  assert.equal(isFairPlayClosure("closed:fair_play_violations"), true);
  assert.equal(isFairPlayClosure("closed"), false);
});
