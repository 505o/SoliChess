import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { buildChessComAuthorizeUrl, OAuthBridgeClient, type ChessComOAuthConfig } from "../src/oauth.js";

const state = "A".repeat(43);
const config: ChessComOAuthConfig = {
  clientId: "client-123",
  authorizeUrl: "https://auth.chess.test/authorize",
  redirectUri: "https://solichess.test/oauth/chesscom/callback",
  scopes: "openid profile",
  bridgeUrl: "https://bridge.test",
  bridgeSecret: "x".repeat(32)
};

test("Chess.com authorization URL contains exact callback and state", () => {
  const url = new URL(buildChessComAuthorizeUrl(config, state));
  assert.equal(url.origin + url.pathname, config.authorizeUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), config.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("scope"), config.scopes);
  assert.equal(url.searchParams.get("state"), state);
});

test("OAuth bridge consumes a verified public identity", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${config.bridgeSecret}`);
    const url = new URL(request.url ?? "/", "http://localhost");
    assert.equal(url.pathname, "/oauth/result");
    assert.equal(url.searchParams.get("state"), state);
    assert.equal(url.searchParams.get("consume"), "1");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ username: "VerifiedPlayer", playerId: "12345" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const bridge = new OAuthBridgeClient(`http://127.0.0.1:${address.port}`, config.bridgeSecret);
    assert.deepEqual(await bridge.consumeIdentity(state), { username: "VerifiedPlayer", playerId: 12345 });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("OAuth bridge reports a pending callback", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "pending" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const bridge = new OAuthBridgeClient(`http://127.0.0.1:${address.port}`, config.bridgeSecret);
    assert.equal(await bridge.consumeIdentity(state), null);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
