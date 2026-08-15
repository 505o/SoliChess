import { Chess, type Color, type PieceSymbol } from "chess.js";
import sharp from "sharp";

const PIECES: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const CANVAS_WIDTH = 1184;
const CANVAS_HEIGHT = 1120;
const BOARD_X = 80;
const BOARD_Y = 32;
const SQUARE = 132;
const BOARD_SIZE = SQUARE * 8;

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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

export async function renderBoard(
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

  const squares: string[] = [];
  const pieces: string[] = [];
  const labels: string[] = [];
  for (let displayRow = 0; displayRow < 8; displayRow += 1) {
    for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
      const boardRow = orientation === "w" ? displayRow : 7 - displayRow;
      const boardColumn = orientation === "w" ? displayColumn : 7 - displayColumn;
      const x = BOARD_X + displayColumn * SQUARE;
      const y = BOARD_Y + displayRow * SQUARE;
      const name = squareName(boardRow, boardColumn);
      const light = (boardRow + boardColumn) % 2 === 0;
      const fill = light ? "#e8ead8" : "#668876";
      squares.push(`<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${fill}"/>`);
      if (highlighted.has(name)) {
        squares.push(`<rect x="${x + 6}" y="${y + 6}" width="${SQUARE - 12}" height="${SQUARE - 12}" rx="13" fill="#f4c542" fill-opacity="0.62" stroke="#ffe382" stroke-width="4" stroke-opacity="0.85"/>`);
      }

      const piece = position[boardRow]?.[boardColumn];
      if (piece) {
        const glyph = PIECES[piece.type];
        const color = piece.color === "w" ? "#f8fafb" : "#20262d";
        const stroke = piece.color === "w" ? "#26313a" : "#e4e9ec";
        const strokeWidth = piece.color === "w" ? 3.5 : 1.8;
        pieces.push(
          `<text x="${x + SQUARE / 2}" y="${y + 106}" text-anchor="middle" font-family="DejaVu Sans, Segoe UI Symbol, serif" font-size="114" font-weight="700" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke" filter="url(#piece-shadow)">${glyph}</text>`
        );
      }

      const coordinateColor = light ? "#668876" : "#e8ead8";
      if (displayColumn === 0) {
        const rank = orientation === "w" ? 8 - displayRow : displayRow + 1;
        labels.push(`<text x="${x + 10}" y="${y + 27}" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${coordinateColor}">${rank}</text>`);
      }
      if (displayRow === 7) {
        const fileIndex = orientation === "w" ? displayColumn : 7 - displayColumn;
        labels.push(`<text x="${x + SQUARE - 12}" y="${y + SQUARE - 10}" text-anchor="end" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${coordinateColor}">${FILES[fileIndex]}</text>`);
      }
    }
  }

  let bestArrow = "";
  if (bestMove && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) {
    const from = squareCenter(bestMove.slice(0, 2), orientation);
    const to = squareCenter(bestMove.slice(2, 4), orientation);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const unitX = (to.x - from.x) / distance;
    const unitY = (to.y - from.y) / distance;
    const startX = from.x + unitX * 32;
    const startY = from.y + unitY * 32;
    const endX = to.x - unitX * 46;
    const endY = to.y - unitY * 46;
    bestArrow = `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#16251f" stroke-width="28" stroke-opacity="0.48" stroke-linecap="round"/>
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#28d17c" stroke-width="16" stroke-opacity="0.94" stroke-linecap="round" marker-end="url(#best-arrow)"/>`;
  }

  let evaluationBar = "";
  if (whiteEvaluation !== undefined) {
    const normalized = Math.max(-1000, Math.min(1000, whiteEvaluation));
    const whiteShare = 1 / (1 + Math.exp(-normalized / 260));
    const whiteHeight = Math.max(12, Math.min(BOARD_SIZE - 12, BOARD_SIZE * whiteShare));
    const whiteY = orientation === "w" ? BOARD_Y + BOARD_SIZE - whiteHeight : BOARD_Y;
    const splitY = orientation === "w" ? whiteY : whiteY + whiteHeight;
    evaluationBar = `<rect x="22" y="${BOARD_Y}" width="34" height="${BOARD_SIZE}" rx="12" fill="#171b20"/>
      <rect x="22" y="${whiteY}" width="34" height="${whiteHeight}" rx="12" fill="#f1f3f4"/>
      <line x1="18" y1="${splitY}" x2="60" y2="${splitY}" stroke="#6ee7a0" stroke-width="7" stroke-linecap="round"/>
      <rect x="22" y="${BOARD_Y}" width="34" height="${BOARD_SIZE}" rx="12" fill="none" stroke="#59616b" stroke-width="3"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
    <defs>
      <marker id="best-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 Z" fill="#28d17c"/></marker>
      <filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#101419" flood-opacity="0.38"/></filter>
    </defs>
    <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" rx="28" fill="#14181d"/>
    <rect x="${BOARD_X - 7}" y="${BOARD_Y - 7}" width="${BOARD_SIZE + 14}" height="${BOARD_SIZE + 14}" rx="18" fill="#252b32"/>
    ${squares.join("")}
    ${bestArrow}
    ${pieces.join("")}
    ${labels.join("")}
    ${evaluationBar}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderEvaluationGraph(whiteEvaluations: number[]): Promise<Buffer> {
  const width = 1000;
  const height = 320;
  const left = 48;
  const top = 30;
  const graphWidth = width - left - 28;
  const graphHeight = height - top - 48;
  const clamped = whiteEvaluations.map((value) => Math.max(-1000, Math.min(1000, value)));
  const points = clamped.map((value, index) => {
    const x = left + (index / Math.max(1, clamped.length - 1)) * graphWidth;
    const y = top + graphHeight / 2 - (value / 1000) * (graphHeight / 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" rx="22" fill="#171a20"/>
    <rect x="${left}" y="${top}" width="${graphWidth}" height="${graphHeight}" rx="10" fill="#22262e"/>
    <line x1="${left}" y1="${top + graphHeight / 2}" x2="${left + graphWidth}" y2="${top + graphHeight / 2}" stroke="#636a76" stroke-width="2"/>
    <line x1="${left}" y1="${top + graphHeight * 0.25}" x2="${left + graphWidth}" y2="${top + graphHeight * 0.25}" stroke="#343944" stroke-width="1"/>
    <line x1="${left}" y1="${top + graphHeight * 0.75}" x2="${left + graphWidth}" y2="${top + graphHeight * 0.75}" stroke="#343944" stroke-width="1"/>
    <polyline points="${escapeXml(points)}" fill="none" stroke="#72d58b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="18" y="${top + 8}" font-family="system-ui, sans-serif" font-size="15" fill="#f1f2f4">+10</text>
    <text x="25" y="${top + graphHeight / 2 + 5}" font-family="system-ui, sans-serif" font-size="15" fill="#aeb4be">0</text>
    <text x="18" y="${top + graphHeight}" font-family="system-ui, sans-serif" font-size="15" fill="#f1f2f4">−10</text>
    <text x="${left}" y="${height - 15}" font-family="system-ui, sans-serif" font-size="16" fill="#aeb4be">البداية</text>
    <text x="${left + graphWidth}" y="${height - 15}" text-anchor="end" font-family="system-ui, sans-serif" font-size="16" fill="#aeb4be">النهاية</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
