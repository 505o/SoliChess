import type { ChessComGame, ChessComProfile, ChessComStats, RatingSnapshot } from "./types.js";

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
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(private readonly userAgent: string) {}

  private async get<T>(path: string): Promise<T> {
    return this.getUrl<T>(`${API_BASE}${path}`);
  }

  private async getUrl<T>(url: string): Promise<T> {
    const request = this.requestQueue.then(() => this.fetchUrl<T>(url));
    this.requestQueue = request.then(() => undefined, () => undefined);
    return request;
  }

  private async fetchUrl<T>(url: string): Promise<T> {
    const response = await fetch(url, {
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

  async getLatestCompletedGame(username: string): Promise<ChessComGame> {
    const clean = cleanUsername(username);
    const archiveIndex = await this.get<{ archives: string[] }>(`/player/${encodeURIComponent(clean)}/games/archives`);
    if (archiveIndex.archives.length === 0) throw new ChessComApiError("لا توجد مباريات مكتملة لهذا الحساب.", 404);
    for (const archiveUrl of archiveIndex.archives.slice(-6).reverse()) {
      const archive = await this.getUrl<{ games: ChessComGame[] }>(archiveUrl);
      const games = archive.games
        .filter((game) => game.rules === "chess" && Boolean(game.end_time) && Boolean(game.pgn))
        .sort((first, second) => second.end_time - first.end_time);
      const latest = games[0];
      if (latest) return latest;
    }
    throw new ChessComApiError("لا توجد مباراة شطرنج مكتملة قابلة للتحليل.", 404);
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
