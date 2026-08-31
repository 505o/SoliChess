const DEFAULT_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

const pieceNames: Record<string, string> = {
  K: 'ملك أبيض', Q: 'وزير أبيض', R: 'قلعة بيضاء', B: 'فيل أبيض', N: 'حصان أبيض', P: 'بيدق أبيض',
  k: 'ملك أسود', q: 'وزير أسود', r: 'قلعة سوداء', b: 'فيل أسود', n: 'حصان أسود', p: 'بيدق أسود',
};

function parseFen(fen: string) {
  return fen.split(' ')[0].split('/').flatMap((rank) =>
    rank.split('').flatMap((token) => {
      const emptySquares = Number(token);
      return Number.isNaN(emptySquares) ? [token] : Array<string>(emptySquares).fill('');
    }),
  );
}

function squareCenter(square: string) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return { x: (file + 0.5) * 12.5, y: (8 - rank + 0.5) * 12.5 };
}

function pieceAsset(piece: string) {
  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  return `/pieces/${color}${piece.toUpperCase()}.svg`;
}

type ChessBoardProps = {
  compact?: boolean;
  fen?: string;
  from?: string;
  to?: string;
};

export function ChessBoard({ compact = false, fen = DEFAULT_FEN, from = 'f1', to = 'b5' }: ChessBoardProps) {
  const pieces = parseFen(fen);
  const start = squareCenter(from);
  const end = squareCenter(to);
  const markerId = `move-arrow-${from}-${to}`;

  return (
    <figure className={`chess-board ${compact ? 'chess-board-compact' : ''}`} aria-label={`وضعية شطرنج، النقلة من ${from} إلى ${to}`}>
      {pieces.map((piece, index) => {
        const rowIndex = Math.floor(index / 8);
        const columnIndex = index % 8;
        const square = `${String.fromCharCode(97 + columnIndex)}${8 - rowIndex}`;
        const isLight = (rowIndex + columnIndex) % 2 === 0;
        return (
          <span
            key={square}
            className={`${isLight ? 'light-square' : 'dark-square'} ${square === from ? 'from-square' : ''} ${square === to ? 'to-square' : ''}`}
          >
            {piece && <Image src={pieceAsset(piece)} alt={pieceNames[piece]} width={128} height={128} draggable={false} unoptimized />}
            {columnIndex === 0 && <small className="rank-label">{8 - rowIndex}</small>}
            {rowIndex === 7 && <small className="file-label">{String.fromCharCode(97 + columnIndex)}</small>}
          </span>
        );
      })}
      <svg className="board-arrow" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" markerWidth="3.5" markerHeight="3.5" refX="8.5" refY="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4fe1bc" />
          </marker>
        </defs>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="#4fe1bc"
          strokeWidth="1.8"
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
        />
      </svg>
    </figure>
  );
}
import Image from 'next/image';
