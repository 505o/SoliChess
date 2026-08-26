export interface ChessComOAuthConfig {
  clientId: string;
  authorizeUrl: string;
  redirectUri: string;
  scopes: string;
  bridgeUrl: string;
  bridgeSecret: string;
}

export interface OAuthIdentity {
  username: string;
  playerId: number | null;
}

export class OAuthBridgeError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "OAuthBridgeError";
  }
}

export function buildChessComAuthorizeUrl(config: ChessComOAuthConfig, state: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error("Invalid OAuth state");
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (config.scopes.trim()) url.searchParams.set("scope", config.scopes.trim());
  return url.toString();
}

export class OAuthBridgeClient {
  private readonly fetchHttp: typeof globalThis.fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string
  ) {
    this.fetchHttp = globalThis.fetch.bind(globalThis);
  }

  async consumeIdentity(state: string): Promise<OAuthIdentity | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new OAuthBridgeError("طلب OAuth غير صالح.", 400);
    const url = new URL("/oauth/result", this.baseUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("consume", "1");

    const response = await this.fetchHttp(url, {
      headers: {
        Authorization: `Bearer ${this.secret}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(12_000)
    });

    if (response.status === 202 || response.status === 404) return null;
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const message = typeof payload?.message === "string" ? payload.message : `OAuth bridge returned ${response.status}`;
      throw new OAuthBridgeError(message, response.status);
    }

    const username = typeof payload?.username === "string" ? payload.username.trim() : "";
    const rawPlayerId = payload?.playerId;
    const playerId = typeof rawPlayerId === "number" && Number.isSafeInteger(rawPlayerId) ? rawPlayerId
      : typeof rawPlayerId === "string" && /^\d+$/.test(rawPlayerId) ? Number.parseInt(rawPlayerId, 10)
        : null;
    if (!/^[a-zA-Z0-9_-]{2,40}$/.test(username)) {
      throw new OAuthBridgeError("لم يُرجع Chess.com اسم مستخدم صالحًا.", 502);
    }
    return { username, playerId };
  }
}
