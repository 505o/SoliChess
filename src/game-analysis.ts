import { Chess, type Color, type Move, type Square } from "chess.js";
import type { ChessComGame } from "./types.js";
import { type EngineEvaluation, StockfishEngine } from "./stockfish.js";

export type MoveClassification = "best" | "excellent" | "inaccuracy" | "mistake" | "blunder";

export interface CriticalMove {
  moveNumber: number;
  playedSan: string;
  bestSan: string;
  principalVariation: string;
  centipawnLoss: number;
  classification: MoveClassification;
  fenBefore: string;
}

export interface GameAnalysisResult {
  username: string;
  color: Color;
  opponent: string;
  result: string;
  timeClass: string;
  gameUrl: string;
  moveCount: number;
  approximateAccuracy: number;
  averageCentipawnLoss: number;
  counts: Record<MoveClassification, number>;
  criticalMoves: CriticalMove[];
  whiteEvaluations: number[];
  engineDepth: number;
}

function terminalEvaluation(chess: Chess): number | null {
  if (chess.isCheckmate()) return -100_000;
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) return 0;
  return null;
}

function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function playUci(chess: Chess, uci: string): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return chess.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {})
  });
}

function pvToSan(fen: string, variation: string[], limit = 4): string {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of variation.slice(0, limit)) {
    const move = playUci(chess, uci);
    if (!move) break;
    san.push(move.san);
  }
  return san.join(" ");
}

export function classifyLoss(loss: number, playedUci: string, bestMove: string | null): MoveClassification {
  if (playedUci === bestMove || loss <= 20) return "best";
  if (loss <= 60) return "excellent";
  if (loss <= 120) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

function approximateAccuracy(averageLoss: number): number {
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-averageLoss / 220))));
}

function playerResult(game: ChessComGame, color: Color): string {
  return color === "w" ? game.white.result : game.black.result;
}

export async function analyzeCompletedGame(
  game: ChessComGame,
  username: string,
  engine: StockfishEngine,
  depth: number
): Promise<GameAnalysisResult> {
  if (!game.end_time) throw new Error("لا يمكن تحليل مباراة لم تنتهِ بعد.");
  if (game.rules !== "chess") throw new Error("تحليل النسخة الأولى يدعم الشطرنج العادي فقط.");

  const parsed = new Chess();
  parsed.loadPgn(game.pgn);
  const moves = parsed.history({ verbose: true });
  if (moves.length < 2) throw new Error("المباراة قصيرة جدًا للتحليل.");
  if (moves.length > 200) throw new Error("المباراة أطول من حد التحليل الحالي (200 نصف نقلة). ");

  const lowerUsername = username.toLowerCase();
  const color: Color = game.white.username.toLowerCase() === lowerUsername ? "w"
    : game.black.username.toLowerCase() === lowerUsername ? "b"
      : (() => { throw new Error("الحساب المرتبط ليس أحد لاعبي المباراة."); })();
  const opponent = color === "w" ? game.black.username : game.white.username;
  const positions = [moves[0]!.before, ...moves.map((move) => move.after)];
  const evaluations: EngineEvaluation[] = [];

  for (const fen of positions) {
    const chess = new Chess(fen);
    const terminal = terminalEvaluation(chess);
    if (terminal !== null) {
      evaluations.push({ centipawns: terminal, bestMove: null, principalVariation: [], depth });
    } else {
      evaluations.push(await engine.analyzeFen(fen, depth));
    }
  }

  const counts: Record<MoveClassification, number> = {
    best: 0,
    excellent: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0
  };
  const playerMoves: CriticalMove[] = [];
  const losses: number[] = [];

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index]!;
    if (move.color !== color) continue;
    const before = evaluations[index]!;
    const after = evaluations[index + 1]!;
    const loss = Math.max(0, Math.min(100_000, before.centipawns + after.centipawns));
    const playedUci = moveToUci(move);
    const classification = classifyLoss(loss, playedUci, before.bestMove);
    counts[classification] += 1;
    losses.push(loss);

    if (classification === "inaccuracy" || classification === "mistake" || classification === "blunder") {
      const bestBoard = new Chess(move.before);
      const best = before.bestMove ? playUci(bestBoard, before.bestMove) : null;
      playerMoves.push({
        moveNumber: Math.floor(index / 2) + 1,
        playedSan: move.san,
        bestSan: best?.san ?? "—",
        principalVariation: pvToSan(move.before, before.principalVariation),
        centipawnLoss: loss,
        classification,
        fenBefore: move.before
      });
    }
  }

  const averageLoss = losses.length ? Math.round(losses.reduce((sum, loss) => sum + loss, 0) / losses.length) : 0;
  const whiteEvaluations = positions.map((fen, index) => {
    const turn = fen.split(" ")[1];
    const score = evaluations[index]!.centipawns;
    return turn === "w" ? score : -score;
  });

  return {
    username,
    color,
    opponent,
    result: playerResult(game, color),
    timeClass: game.time_class,
    gameUrl: game.url,
    moveCount: losses.length,
    approximateAccuracy: approximateAccuracy(averageLoss),
    averageCentipawnLoss: averageLoss,
    counts,
    criticalMoves: playerMoves.sort((first, second) => second.centipawnLoss - first.centipawnLoss).slice(0, 5),
    whiteEvaluations,
    engineDepth: Math.min(...evaluations.map((evaluation) => evaluation.depth || depth))
  };
}
