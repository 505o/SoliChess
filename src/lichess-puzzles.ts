import { Chess } from "chess.js";

export interface LichessPuzzle {
  id: string;
  rating: number;
  plays: number;
  solution: string[];
  themes: string[];
  fen: string;
  lastMove: string;
}

interface LichessPuzzleResponse {
  game: {
    pgn: string;
  };
  puzzle: Omit<LichessPuzzle, "fen" | "lastMove"> & {
    fen?: string;
    lastMove?: string;
    initialPly?: number;
  };
}

function moveToUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export class LichessPuzzleClient {
  constructor(private readonly userAgent: string) {}

  async getNextPuzzle(): Promise<LichessPuzzle> {
    const response = await fetch("https://lichess.org/api/puzzle/next", {
      headers: {
        Accept: "application/json",
        "User-Agent": this.userAgent
      },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`Lichess puzzle API returned ${response.status}`);
    const payload = await response.json() as LichessPuzzleResponse;
    if (!payload.puzzle?.id || payload.puzzle.solution.length === 0) {
      throw new Error("Lichess returned an invalid puzzle");
    }
    if (payload.puzzle.fen) {
      return {
        ...payload.puzzle,
        fen: payload.puzzle.fen,
        lastMove: payload.puzzle.lastMove ?? ""
      };
    }

    if (!payload.game?.pgn || payload.puzzle.initialPly === undefined) {
      throw new Error("Lichess puzzle is missing its source position");
    }
    const game = new Chess();
    game.loadPgn(payload.game.pgn);
    const history = game.history({ verbose: true });
    const setupMove = history[payload.puzzle.initialPly];
    if (!setupMove) throw new Error("Lichess puzzle has an invalid initial ply");
    return {
      id: payload.puzzle.id,
      rating: payload.puzzle.rating,
      plays: payload.puzzle.plays,
      solution: payload.puzzle.solution,
      themes: payload.puzzle.themes,
      fen: setupMove.after,
      lastMove: moveToUci(setupMove)
    };
  }
}
