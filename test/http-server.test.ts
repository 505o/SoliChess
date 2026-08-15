import assert from "node:assert/strict";
import test from "node:test";
import { AppHttpServer } from "../src/http-server.js";

test("health endpoint reports the service is ready", async () => {
  const server = new AppHttpServer();
  const port = await server.start(0);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "solichess" });
  } finally {
    await server.stop();
  }
});

test("OAuth callback rejects incomplete and unconfigured requests", async () => {
  const server = new AppHttpServer();
  const port = await server.start(0);
  try {
    const incomplete = await fetch(`http://127.0.0.1:${port}/oauth/chesscom/callback`);
    assert.equal(incomplete.status, 400);

    const pending = await fetch(`http://127.0.0.1:${port}/oauth/chesscom/callback?code=abc&state=xyz`);
    assert.equal(pending.status, 503);
    assert.match(await pending.text(), /OAuth setup pending/);
  } finally {
    await server.stop();
  }
});
