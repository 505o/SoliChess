const rows = [
  ['♜', '♞', '♝', '♛', '♚', '♝', '', '♜'], ['♟', '♟', '♟', '', '♟', '♟', '♟', '♟'], ['', '', '', '♟', '', '♞', '', ''], ['', '', '', '', '♟', '', '', ''],
  ['', '', '', '', '♙', '', '', ''], ['', '', '♘', '', '', '♘', '', ''], ['♙', '♙', '♙', '♙', '', '♙', '♙', '♙'], ['♖', '', '♗', '♕', '♔', '♗', '', '♖'],
];

export function ChessBoard({ compact = false }: { compact?: boolean }) {
  return (
    <figure className={`chess-board ${compact ? 'chess-board-compact' : ''}`} aria-label="وضعية شطرنج توضيحية">
      {rows.flatMap((row, rowIndex) => row.map((piece, columnIndex) => {
        const isLight = (rowIndex + columnIndex) % 2 === 0;
        const isFrom = rowIndex === 5 && columnIndex === 2;
        const isTo = rowIndex === 4 && columnIndex === 4;
        return <span key={`${rowIndex}-${columnIndex}`} className={`${isLight ? 'light-square' : 'dark-square'} ${isFrom || isTo ? 'active-square' : ''}`}>{piece && <i className={piece.charCodeAt(0) >= 9818 && piece.charCodeAt(0) <= 9823 ? 'black-piece' : 'white-piece'}>{piece}</i>}</span>;
      }))}
      <svg className="board-arrow" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="hero-arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#d9f773" /></marker></defs><path d="M31 69 Q42 61 56 52" fill="none" stroke="#d9f773" strokeWidth="3.3" strokeLinecap="round" markerEnd="url(#hero-arrow)" /></svg>
    </figure>
  );
}
