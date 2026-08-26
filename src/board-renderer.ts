import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { clearAllCache, createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { Chess, type Color, type PieceSymbol } from "chess.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const PIECE_TYPES: readonly PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const PIECE_CODES: Record<PieceSymbol, string> = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "P" };
const PIECE_IMAGES = new Map<string, Promise<Image>>();
for (const color of ["w", "b"] as const) {
  for (const type of PIECE_TYPES) {
    const filename = `${color}${PIECE_CODES[type]}.svg`;
    const assetPath = path.resolve(process.cwd(), "assets", "pieces", "chessnut", filename);
    PIECE_IMAGES.set(`${color}${type}`, loadImage(assetPath));
  }
}

const CANVAS_WIDTH = 1184;
const CANVAS_HEIGHT = 1120;
const OUTPUT_SCALE = 0.68;
const OUTPUT_WIDTH = Math.round(CANVAS_WIDTH * OUTPUT_SCALE);
const OUTPUT_HEIGHT = Math.round(CANVAS_HEIGHT * OUTPUT_SCALE);
const BOARD_X = 80;
const BOARD_Y = 32;
const SQUARE = 132;
const BOARD_SIZE = SQUARE * 8;
const BOARD_CACHE_DIRECTORY = path.resolve(process.cwd(), "data", "board-cache");
const MAX_CACHE_FILES = 256;
const pendingRenders = new Map<string, Promise<Buffer>>();
let renderQueue: Promise<void> = Promise.resolve();
let writesSinceCleanup = 0;

function fillRoundedRect(context: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number, color: string): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function strokeRoundedRect(
  context: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  lineWidth: number
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
}

function squareName(boardRow: number, boardColumn: number): string {
  return `${FILES[boardColumn]}${8 - boardRow}`;
}

function squareCenter(square: string, orientation: Color): { x: number; y: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number.parseInt(square[1]!, 10);
  const boardRow = 8 - rank;
  const displayColumn = orientation === "w" ? file : 7 - file;
  const displayRow = orientation === "w" ? boardRow : 7 - boardRow;
  return {
    x: BOARD_X + displayColumn * SQUARE + SQUARE / 2,
    y: BOARD_Y + displayRow * SQUARE + SQUARE / 2
  };
}

function drawArrow(context: SKRSContext2D, fromSquare: string, toSquare: string, orientation: Color): void {
  const from = squareCenter(fromSquare, orientation);
  const to = squareCenter(toSquare, orientation);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance < 1) return;
  const unitX = (to.x - from.x) / distance;
  const unitY = (to.y - from.y) / distance;
  const perpendicularX = -unitY;
  const perpendicularY = unitX;
  const startX = from.x + unitX * 32;
  const startY = from.y + unitY * 32;
  const tipX = to.x - unitX * 15;
  const tipY = to.y - unitY * 15;
  const baseX = tipX - unitX * 48;
  const baseY = tipY - unitY * 48;
  const leftX = baseX + perpendicularX * 28;
  const leftY = baseY + perpendicularY * 28;
  const rightX = baseX - perpendicularX * 28;
  const rightY = baseY - perpendicularY * 28;

  context.save();
  context.lineCap = "round";
  context.strokeStyle = "rgba(7,18,14,0.52)";
  context.lineWidth = 30;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(baseX, baseY);
  context.stroke();
  context.fillStyle = "rgba(7,18,14,0.52)";
  context.beginPath();
  context.moveTo(tipX + unitX * 5, tipY + unitY * 5);
  context.lineTo(leftX + perpendicularX * 5, leftY + perpendicularY * 5);
  context.lineTo(rightX - perpendicularX * 5, rightY - perpendicularY * 5);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(39,216,137,0.96)";
  context.lineWidth = 17;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(baseX, baseY);
  context.stroke();
  context.fillStyle = "rgba(39,216,137,0.96)";
  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(leftX, leftY);
  context.lineTo(rightX, rightY);
  context.closePath();
  context.fill();
  context.restore();
}

function drawEvaluationBar(context: SKRSContext2D, orientation: Color, whiteEvaluation: number): void {
  const normalized = Math.max(-1000, Math.min(1000, whiteEvaluation));
  const whiteShare = 1 / (1 + Math.exp(-normalized / 260));
  const whiteHeight = Math.max(12, Math.min(BOARD_SIZE - 12, BOARD_SIZE * whiteShare));
  const whiteY = orientation === "w" ? BOARD_Y + BOARD_SIZE - whiteHeight : BOARD_Y;
  const splitY = orientation === "w" ? whiteY : whiteY + whiteHeight;

  context.save();
  context.shadowColor = "rgba(5,8,11,0.6)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 5;
  fillRoundedRect(context, 19, BOARD_Y - 2, 39, BOARD_SIZE + 4, 15, "#151b22");
  context.shadowColor = "transparent";
  fillRoundedRect(context, 23, whiteY, 31, whiteHeight, 11, "#f4f0e6");
  context.strokeStyle = "#28d889";
  context.lineWidth = 8;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(17, splitY);
  context.lineTo(60, splitY);
  context.stroke();
  strokeRoundedRect(context, 19, BOARD_Y - 2, 39, BOARD_SIZE + 4, 15, "#64707c", 3);
  context.restore();
}

function boardKey(fen: string, orientation: Color, highlightedMove?: string, bestMove?: string, whiteEvaluation?: number): string {
  const input = `canvas-v2\u0000${fen}\u0000${orientation}\u0000${highlightedMove ?? ""}\u0000${bestMove ?? ""}\u0000${whiteEvaluation ?? ""}`;
  return createHash("sha256").update(input).digest("hex");
}

function cachePath(key: string): string {
  return path.join(BOARD_CACHE_DIRECTORY, `${key}.png`);
}

async function readCachedBoard(key: string): Promise<Buffer | null> {
  try {
    return await readFile(cachePath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function cleanupDiskCache(): Promise<void> {
  const entries = await readdir(BOARD_CACHE_DIRECTORY, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.png$/.test(entry.name));
  if (files.length <= MAX_CACHE_FILES) return;
  const dated = await Promise.all(files.map(async (entry) => ({
    name: entry.name,
    modifiedAt: (await stat(path.join(BOARD_CACHE_DIRECTORY, entry.name))).mtimeMs
  })));
  dated.sort((first, second) => first.modifiedAt - second.modifiedAt);
  for (const entry of dated.slice(0, dated.length - MAX_CACHE_FILES)) {
    await unlink(path.join(BOARD_CACHE_DIRECTORY, entry.name)).catch(() => undefined);
  }
}

async function storeCachedBoard(key: string, value: Buffer): Promise<void> {
  await mkdir(BOARD_CACHE_DIRECTORY, { recursive: true });
  await writeFile(cachePath(key), value);
  writesSinceCleanup += 1;
  if (writesSinceCleanup >= 25) {
    writesSinceCleanup = 0;
    await cleanupDiskCache();
  }
}

async function renderBoardUncached(
  fen: string,
  orientation: Color,
  highlightedMove?: string,
  bestMove?: string,
  whiteEvaluation?: number
): Promise<Buffer> {
  const chess = new Chess(fen);
  const position = chess.board();
  const highlighted = new Set<string>();
  if (highlightedMove && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(highlightedMove)) {
    highlighted.add(highlightedMove.slice(0, 2));
    highlighted.add(highlightedMove.slice(2, 4));
  }

  const canvas = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const context = canvas.getContext("2d");
  context.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  fillRoundedRect(context, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 28, "#10151b");

  context.save();
  context.shadowColor = "rgba(5,8,11,0.65)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 10;
  fillRoundedRect(context, BOARD_X - 10, BOARD_Y - 10, BOARD_SIZE + 20, BOARD_SIZE + 20, 20, "#242d36");
  context.restore();

  context.save();
  context.beginPath();
  context.roundRect(BOARD_X, BOARD_Y, BOARD_SIZE, BOARD_SIZE, 10);
  context.clip();
  for (let displayRow = 0; displayRow < 8; displayRow += 1) {
    for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
      const boardRow = orientation === "w" ? displayRow : 7 - displayRow;
      const boardColumn = orientation === "w" ? displayColumn : 7 - displayColumn;
      const x = BOARD_X + displayColumn * SQUARE;
      const y = BOARD_Y + displayRow * SQUARE;
      const name = squareName(boardRow, boardColumn);
      const light = (boardRow + boardColumn) % 2 === 0;
      context.fillStyle = light ? "#eee8d8" : "#587466";
      context.fillRect(x, y, SQUARE, SQUARE);
      if (highlighted.has(name)) {
        context.fillStyle = "rgba(244,189,63,0.62)";
        context.fillRect(x, y, SQUARE, SQUARE);
        strokeRoundedRect(context, x + 7, y + 7, SQUARE - 14, SQUARE - 14, 9, "rgba(255,228,154,0.72)", 3);
      }
    }
  }
  context.restore();

  if (bestMove && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) {
    drawArrow(context, bestMove.slice(0, 2), bestMove.slice(2, 4), orientation);
  }

  for (let displayRow = 0; displayRow < 8; displayRow += 1) {
    for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
      const boardRow = orientation === "w" ? displayRow : 7 - displayRow;
      const boardColumn = orientation === "w" ? displayColumn : 7 - displayColumn;
      const x = BOARD_X + displayColumn * SQUARE;
      const y = BOARD_Y + displayRow * SQUARE;
      const piece = position[boardRow]?.[boardColumn];
      if (piece) {
        const image = await PIECE_IMAGES.get(`${piece.color}${piece.type}`);
        if (image) {
          context.save();
          context.shadowColor = "rgba(7,16,24,0.42)";
          context.shadowBlur = 8;
          context.shadowOffsetY = 5;
          context.drawImage(image, x + 4, y + 2, SQUARE - 8, SQUARE - 5);
          context.restore();
        }
      }

      const light = (boardRow + boardColumn) % 2 === 0;
      context.fillStyle = light ? "#587466" : "#eee8d8";
      context.globalAlpha = 0.92;
      context.font = "800 20px Arial, sans-serif";
      if (displayColumn === 0) {
        const rank = orientation === "w" ? 8 - displayRow : displayRow + 1;
        context.textAlign = "left";
        context.textBaseline = "alphabetic";
        context.fillText(String(rank), x + 10, y + 25);
      }
      if (displayRow === 7) {
        const fileIndex = orientation === "w" ? displayColumn : 7 - displayColumn;
        context.textAlign = "right";
        context.textBaseline = "alphabetic";
        context.fillText(FILES[fileIndex]!, x + SQUARE - 11, y + SQUARE - 10);
      }
      context.globalAlpha = 1;
    }
  }

  if (whiteEvaluation !== undefined) drawEvaluationBar(context, orientation, whiteEvaluation);
  try {
    return await canvas.encode("png");
  } finally {
    canvas.width = 1;
    canvas.height = 1;
    clearAllCache();
  }
}

export function renderBoard(
  fen: string,
  orientation: Color,
  highlightedMove?: string,
  bestMove?: string,
  whiteEvaluation?: number
): Promise<Buffer> {
  const key = boardKey(fen, orientation, highlightedMove, bestMove, whiteEvaluation);
  const pending = pendingRenders.get(key);
  if (pending) return pending;

  const job = (async () => {
    const cached = await readCachedBoard(key);
    if (cached) return cached;
    const render = renderQueue.then(() => renderBoardUncached(fen, orientation, highlightedMove, bestMove, whiteEvaluation));
    renderQueue = render.then(() => undefined, () => undefined);
    const buffer = await render;
    await storeCachedBoard(key, buffer);
    return buffer;
  })().finally(() => pendingRenders.delete(key));
  pendingRenders.set(key, job);
  return job;
}

export async function renderEvaluationGraph(whiteEvaluations: number[]): Promise<Buffer> {
  const width = 1000;
  const height = 320;
  const left = 48;
  const top = 30;
  const graphWidth = width - left - 28;
  const graphHeight = height - top - 48;
  const clamped = whiteEvaluations.map((value) => Math.max(-1000, Math.min(1000, value)));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  fillRoundedRect(context, 0, 0, width, height, 22, "#171a20");
  fillRoundedRect(context, left, top, graphWidth, graphHeight, 10, "#22262e");

  context.lineWidth = 2;
  context.strokeStyle = "#636a76";
  context.beginPath();
  context.moveTo(left, top + graphHeight / 2);
  context.lineTo(left + graphWidth, top + graphHeight / 2);
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = "#343944";
  for (const fraction of [0.25, 0.75]) {
    context.beginPath();
    context.moveTo(left, top + graphHeight * fraction);
    context.lineTo(left + graphWidth, top + graphHeight * fraction);
    context.stroke();
  }

  context.strokeStyle = "#72d58b";
  context.lineWidth = 5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  clamped.forEach((value, index) => {
    const x = left + (index / Math.max(1, clamped.length - 1)) * graphWidth;
    const y = top + graphHeight / 2 - (value / 1000) * (graphHeight / 2);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  context.font = "15px Arial, sans-serif";
  context.textAlign = "left";
  context.fillStyle = "#f1f2f4";
  context.fillText("+10", 18, top + 8);
  context.fillStyle = "#aeb4be";
  context.fillText("0", 25, top + graphHeight / 2 + 5);
  context.fillStyle = "#f1f2f4";
  context.fillText("−10", 18, top + graphHeight);
  context.font = "16px Arial, sans-serif";
  context.fillStyle = "#aeb4be";
  context.fillText("البداية", left, height - 15);
  context.textAlign = "right";
  context.fillText("النهاية", left + graphWidth, height - 15);

  try {
    return await canvas.encode("png");
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
