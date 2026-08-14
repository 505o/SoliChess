import assert from "node:assert/strict";
import test from "node:test";
import { ratingBracket, ratingRoleName } from "../src/rating-roles.js";

test("ratingBracket handles every boundary", () => {
  assert.equal(ratingBracket(0), "0–799");
  assert.equal(ratingBracket(799), "0–799");
  assert.equal(ratingBracket(800), "800–999");
  assert.equal(ratingBracket(999), "800–999");
  assert.equal(ratingBracket(1000), "1000–1199");
  assert.equal(ratingBracket(2399), "2200–2399");
  assert.equal(ratingBracket(2400), "2400+");
  assert.equal(ratingBracket(3100), "2400+");
});

test("ratingRoleName creates stable names", () => {
  assert.equal(ratingRoleName("rapid", 1542), "Rapid • 1400–1599");
  assert.equal(ratingRoleName("blitz", 2450), "Blitz • 2400+");
});
