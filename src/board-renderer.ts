import { Chess, type Color, type PieceSymbol } from "chess.js";
import sharp from "sharp";

const PIECE_SYMBOLS = `
  <symbol id="piece-p" viewBox="0 0 100 100">
    <circle cx="50" cy="23" r="13"/>
    <path d="M39 39h22c-1 9-5 15-9 20 10 4 17 12 19 23H29c2-11 9-19 19-23-4-5-8-11-9-20Z"/>
    <path d="M25 82h50l6 10H19l6-10Z"/>
  </symbol>
  <symbol id="piece-r" viewBox="0 0 100 100">
    <path d="M22 13h15v10h13V13h13v10h15V13h8v27H14V13h8Z"/>
    <path d="M23 40h54l-7 38H30l-7-38Z"/>
    <path d="M25 78h50l7 14H18l7-14Z"/>
    <path d="M31 48h38M29 76h42" fill="none"/>
  </symbol>
  <symbol id="piece-n" viewBox="0 0 100 100">
    <path d="M28 78c2-17 8-29 20-38l-10-5 13-23 8 13c18 6 27 22 22 40-2 7-7 12-14 15H39L28 78Z"/>
    <path d="M28 78h43l10 14H19l9-14Z"/>
    <path d="M51 13 40 35M54 45c8 1 13 5 16 10" fill="none"/>
    <circle cx="61" cy="35" r="3.3" stroke="none" fill="#ffffff" fill-opacity="0.72"/>
  </symbol>
  <symbol id="piece-b" viewBox="0 0 100 100">
    <path d="M50 9c12 11 20 21 20 34 0 10-6 18-15 23h-10c-9-5-15-13-15-23 0-13 8-23 20-34Z"/>
    <path d="M35 65h30l9 14H26l9-14Z"/>
    <path d="M24 79h52l7 13H17l7-13Z"/>
    <path d="m58 24-17 25" fill="none" stroke-width="6"/>
  </symbol>
  <symbol id="piece-q" viewBox="0 0 100 100">
    <circle cx="18" cy="19" r="5"/><circle cx="38" cy="12" r="5"/><circle cx="62" cy="12" r="5"/><circle cx="82" cy="19" r="5"/>
    <path d="m18 25 12 38h40l12-38-20 20-12-27-12 27-20-20Z"/>
    <path d="M30 63h40l7 16H23l7-16Z"/>
    <path d="M22 79h56l7 13H15l7-13Z"/>
    <path d="M29 61h42" fill="none"/>
  </symbol>
  <symbol id="piece-k" viewBox="0 0 100 100">
    <path d="M50 6v23M39 16h22" fill="none" stroke-width="7"/>
    <path d="M37 31h26l8 15-12 18H41L29 46l8-15Z"/>
    <path d="M34 63h32l9 16H25l9-16Z"/>
    <path d="M23 79h54l8 13H15l8-13Z"/>
    <path d="M34 61h32" fill="none"/>
  </symbol>`;

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const CANVAS_WIDTH = 1184;
const CANVAS_HEIGHT = 1120;
const BOARD_X = 80;
const BOARD_Y = 32;
const SQUARE = 132;
const BOARD_SIZE = SQUARE * 8;

function pieceSvg(type: PieceSymbol, color: Color, x: number, y: number): string {
  const fill = color === "w" ? "#f7f3e8" : "#202832";
  const stroke = color === "w" ? "#46515c" : "#0d131a";
  return `<g filter="url(#piece-shadow)">
    <use href="#piece-${type}" x="${x + 10}" y="${y + 7}" width="${SQUARE - 20}" height="${SQUARE - 14}"
      fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </g>`;
}

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
      const fill = light ? "#eee8d8" : "#587466";
      squares.push(`<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${fill}"/>`);
      if (highlighted.has(name)) {
        squares.push(`<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="#f4bd3f" fill-opacity="0.62"/>
          <rect x="${x + 7}" y="${y + 7}" width="${SQUARE - 14}" height="${SQUARE - 14}" rx="9" fill="none" stroke="#ffe49a" stroke-width="3" stroke-opacity="0.72"/>`);
      }

      const piece = position[boardRow]?.[boardColumn];
      if (piece) {
        pieces.push(pieceSvg(piece.type, piece.color, x, y));
      }

      const coordinateColor = light ? "#587466" : "#eee8d8";
      if (displayColumn === 0) {
        const rank = orientation === "w" ? 8 - displayRow : displayRow + 1;
        labels.push(`<text x="${x + 10}" y="${y + 25}" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="${coordinateColor}" fill-opacity="0.92">${rank}</text>`);
      }
      if (displayRow === 7) {
        const fileIndex = orientation === "w" ? displayColumn : 7 - displayColumn;
        labels.push(`<text x="${x + SQUARE - 11}" y="${y + SQUARE - 10}" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="${coordinateColor}" fill-opacity="0.92">${FILES[fileIndex]}</text>`);
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
    bestArrow = `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#07120e" stroke-width="30" stroke-opacity="0.5" stroke-linecap="round"/>
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#27d889" stroke-width="17" stroke-opacity="0.96" stroke-linecap="round" marker-end="url(#best-arrow)"/>`;
  }

  let evaluationBar = "";
  if (whiteEvaluation !== undefined) {
    const normalized = Math.max(-1000, Math.min(1000, whiteEvaluation));
    const whiteShare = 1 / (1 + Math.exp(-normalized / 260));
    const whiteHeight = Math.max(12, Math.min(BOARD_SIZE - 12, BOARD_SIZE * whiteShare));
    const whiteY = orientation === "w" ? BOARD_Y + BOARD_SIZE - whiteHeight : BOARD_Y;
    const splitY = orientation === "w" ? whiteY : whiteY + whiteHeight;
    evaluationBar = `<rect x="19" y="${BOARD_Y - 2}" width="39" height="${BOARD_SIZE + 4}" rx="15" fill="#151b22" filter="url(#bar-shadow)"/>
      <rect x="23" y="${whiteY}" width="31" height="${whiteHeight}" rx="11" fill="#f4f0e6"/>
      <line x1="17" y1="${splitY}" x2="60" y2="${splitY}" stroke="#28d889" stroke-width="8" stroke-linecap="round"/>
      <rect x="19" y="${BOARD_Y - 2}" width="39" height="${BOARD_SIZE + 4}" rx="15" fill="none" stroke="#64707c" stroke-width="3"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
    <defs>
      ${PIECE_SYMBOLS}
      <marker id="best-arrow" markerWidth="4.5" markerHeight="4.5" refX="3.5" refY="2.25" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4.5,2.25 L0,4.5 Z" fill="#27d889"/></marker>
      <filter id="piece-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#071018" flood-opacity="0.42"/></filter>
      <filter id="board-shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#05080b" flood-opacity="0.65"/></filter>
      <filter id="bar-shadow" x="-50%" y="-10%" width="200%" height="120%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#05080b" flood-opacity="0.6"/></filter>
    </defs>
    <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" rx="28" fill="#10151b"/>
    <rect x="${BOARD_X - 10}" y="${BOARD_Y - 10}" width="${BOARD_SIZE + 20}" height="${BOARD_SIZE + 20}" rx="20" fill="#242d36" filter="url(#board-shadow)"/>
    <g clip-path="inset(0 round 10px)">${squares.join("")}</g>
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
