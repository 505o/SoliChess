import { Chess, type Color, type Move, type Square } from "chess.js";
import type { PuzzleSession } from "./types.js";
import type { LichessPuzzle } from "./lichess-puzzles.js";

export interface PuzzleMoveResult {
  kind: "wrong" | "continue" | "solved";
  session: PuzzleSession;
  playedSan?: string;
  opponentSan?: string;
}

export function sessionFromPuzzle(guildId: string, discordUserId: string, puzzle: LichessPuzzle): PuzzleSession {
  const turn = puzzle.fen.split(" ")[1];
  if (turn !== "w" && turn !== "b") throw new Error("Puzzle FEN has an invalid active color");
  return {
    guildId,
    discordUserId,
    puzzleId: puzzle.id,
    currentFen: puzzle.fen,
    solutionMoves: puzzle.solution,
    currentIndex: 0,
    puzzleRating: puzzle.rating,
    themes: puzzle.themes,
    userColor: turn,
    failedOnce: false,
    startedAt: Date.now()
  };
}

export function uciFromMove(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function playUci(chess: Chess, uci: string): Move {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Invalid UCI move: ${uci}`);
  const move = chess.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {})
  });
  if (!move) throw new Error(`Illegal UCI move: ${uci}`);
  return move;
}

function playUserMove(chess: Chess, input: string): Move {
  const value = input.trim().replaceAll("0-0-0", "O-O-O").replaceAll("0-0", "O-O");
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(value)) {
    return playUci(chess, value.toLowerCase());
  }
  try {
    const move = chess.move(value, { strict: false });
    if (move) return move;
  } catch {
    // Retry below with a normalized lowercase piece letter.
  }
  if (/^[kqrbn]/.test(value)) {
    const normalized = `${value[0]!.toUpperCase()}${value.slice(1)}`;
    const move = chess.move(normalized, { strict: false });
    if (move) return move;
  }
  throw new Error("Illegal move");
}

export function submitPuzzleMove(session: PuzzleSession, input: string): PuzzleMoveResult {
  const chess = new Chess(session.currentFen);
  const move = playUserMove(chess, input);
  const actualUci = uciFromMove(move);
  const expectedUci = session.solutionMoves[session.currentIndex];
  const alternateCheckmate = chess.isCheckmate();

  if (actualUci !== expectedUci && !alternateCheckmate) {
    return { kind: "wrong", session: { ...session, failedOnce: true }, playedSan: move.san };
  }

  const nextIndex = session.currentIndex + 1;
  if (alternateCheckmate || nextIndex >= session.solutionMoves.length) {
    return { kind: "solved", session: { ...session, currentFen: chess.fen() }, playedSan: move.san };
  }

  const opponent = playUci(chess, session.solutionMoves[nextIndex]!);
  const followingIndex = nextIndex + 1;
  const updated: PuzzleSession = {
    ...session,
    currentFen: chess.fen(),
    currentIndex: followingIndex
  };

  if (followingIndex >= session.solutionMoves.length) {
    return { kind: "solved", session: updated, playedSan: move.san, opponentSan: opponent.san };
  }
  return { kind: "continue", session: updated, playedSan: move.san, opponentSan: opponent.san };
}

export function puzzleHint(session: PuzzleSession): string {
  const uci = session.solutionMoves[session.currentIndex];
  if (!uci) return "لا توجد نقلة متبقية.";
  const chess = new Chess(session.currentFen);
  const square = uci.slice(0, 2) as Square;
  const piece = chess.get(square);
  const names: Record<string, string> = { p: "البيدق", n: "الحصان", b: "الفيل", r: "القلعة", q: "الوزير", k: "الملك" };
  return piece ? `ابدأ بتحريك **${names[piece.type] ?? "القطعة"}** الموجود على المربع **${square}**.` : `فكّر في القطعة الموجودة على **${square}**.`;
}

export function solutionInSan(session: PuzzleSession): string[] {
  const chess = new Chess(session.currentFen);
  const san: string[] = [];
  for (let index = session.currentIndex; index < session.solutionMoves.length; index += 1) {
    san.push(playUci(chess, session.solutionMoves[index]!).san);
  }
  return san;
}

export function updatedPuzzleRating(playerRating: number, puzzleRating: number, success: boolean): number {
  const expected = 1 / (1 + 10 ** ((puzzleRating - playerRating) / 400));
  const delta = Math.round(28 * ((success ? 1 : 0) - expected));
  return Math.max(100, playerRating + delta);
}

export function themeLabels(themes: string[]): string {
  const labels: Record<string, string> = {
    mate: "مات",
    mateIn1: "مات في نقلة",
    mateIn2: "مات في نقلتين",
    fork: "شوكة",
    pin: "تثبيت",
    skewer: "سيخ",
    sacrifice: "تضحية",
    attraction: "جذب",
    deflection: "إبعاد المدافع",
    discoveredAttack: "هجوم مكتشف",
    crushing: "تفوق حاسم",
    advantage: "كسب أفضلية",
    endgame: "نهاية",
    middlegame: "وسط اللعب",
    opening: "افتتاح"
  };
  return themes.map((theme) => labels[theme] ?? theme).slice(0, 4).join(" • ");
}

export function colorName(color: Color): string {
  return color === "w" ? "الأبيض" : "الأسود";
}
