import type { ChessComProfile, ChessComStats, RatingSnapshot } from "./types.js";

const API_BASE = "https://api.chess.com/pub";

export class ChessComApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ChessComApiError";
  }
}

function cleanUsername(username: string): string {
  const value = username.trim();
  if (!/^[a-zA-Z0-9_-]{2,40}$/.test(value)) {
    throw new ChessComApiError("اسم مستخدم Chess.com غير صالح.", 400);
  }
  return value;
}

export class ChessComClient {
  constructor(private readonly userAgent: string) {}

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new ChessComApiError("لم نجد هذا الحساب في Chess.com.", 404);
      }
      if (response.status === 429) {
        throw new ChessComApiError("Chess.com طلب منا التمهل. حاول بعد قليل.", 429);
      }
      throw new ChessComApiError(`Chess.com API returned ${response.status}.`, response.status);
    }

    return (await response.json()) as T;
  }

  getProfile(username: string): Promise<ChessComProfile> {
    return this.get<ChessComProfile>(`/player/${encodeURIComponent(cleanUsername(username))}`);
  }

  getStats(username: string): Promise<ChessComStats> {
    return this.get<ChessComStats>(`/player/${encodeURIComponent(cleanUsername(username))}/stats`);
  }
}

export function ratingSnapshot(stats: ChessComStats): RatingSnapshot {
  return {
    rapid: stats.chess_rapid?.last?.rating ?? null,
    blitz: stats.chess_blitz?.last?.rating ?? null,
    bullet: stats.chess_bullet?.last?.rating ?? null
  };
}

export function isClosedStatus(status: string): boolean {
  return status.toLowerCase().startsWith("closed");
}

export function isFairPlayClosure(status: string): boolean {
  return status.toLowerCase() === "closed:fair_play_violations";
}
