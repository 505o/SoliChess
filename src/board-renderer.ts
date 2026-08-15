import { Chess, type Color, type PieceSymbol } from "chess.js";
import sharp from "sharp";

const PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_MARGIN = 48;
const SQUARE = 80;
const BOARD_SIZE = SQUARE * 8;

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function squareName(boardRow: number, boardColumn: number): string {
  return `${FILES[boardColumn]}${8 - boardRow}`;
}

export async function renderBoard(
  fen: string,
  orientation: Color,
  highlightedMove?: string
): Promise<Buffer> {
  const chess = new Chess(fen);
  const position = chess.board();
  const highlighted = new Set<string>();
  if (highlightedMove && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(highlightedMove)) {
    highlighted.add(highlightedMove.slice(0, 2));
    highlighted.add(highlightedMove.slice(2, 4));
  }

  const elements: string[] = [];
  for (let displayRow = 0; displayRow < 8; displayRow += 1) {
    for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
      const boardRow = orientation === "w" ? displayRow : 7 - displayRow;
      const boardColumn = orientation === "w" ? displayColumn : 7 - displayColumn;
      const x = BOARD_MARGIN + displayColumn * SQUARE;
      const y = BOARD_MARGIN + displayRow * SQUARE;
      const name = squareName(boardRow, boardColumn);
      const light = (boardRow + boardColumn) % 2 === 0;
      const fill = highlighted.has(name) ? "#d8b64c" : light ? "#e7e1d5" : "#67826f";
      elements.push(`<rect x="${x}" y="${y}" width="${SQUARE}" height="${SQUARE}" fill="${fill}"/>`);

      const piece = position[boardRow]?.[boardColumn];
      if (piece) {
        const glyph = PIECES[piece.color][piece.type];
        const color = piece.color === "w" ? "#fafafa" : "#16181d";
        const stroke = piece.color === "w" ? "#30343b" : "#e2e4e8";
        elements.push(
          `<text x="${x + SQUARE / 2}" y="${y + 61}" text-anchor="middle" font-family="DejaVu Sans, Segoe UI Symbol, serif" font-size="68" fill="${color}" stroke="${stroke}" stroke-width="1.4" paint-order="stroke">${glyph}</text>`
        );
      }
    }
  }

  for (let index = 0; index < 8; index += 1) {
    const fileIndex = orientation === "w" ? index : 7 - index;
    const rank = orientation === "w" ? 8 - index : index + 1;
    elements.push(`<text x="${BOARD_MARGIN + index * SQUARE + SQUARE / 2}" y="${BOARD_MARGIN + BOARD_SIZE + 30}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" fill="#aeb4be">${FILES[fileIndex]}</text>`);
    elements.push(`<text x="22" y="${BOARD_MARGIN + index * SQUARE + 50}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" fill="#aeb4be">${rank}</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="736" height="736" viewBox="0 0 736 736">
    <rect width="736" height="736" rx="24" fill="#171a20"/>
    <rect x="40" y="40" width="656" height="656" rx="10" fill="#252932"/>
    ${elements.join("")}
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
