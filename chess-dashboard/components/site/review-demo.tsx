'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChessBoard } from '@/components/site/chess-board';

const moves = [
  { move: 'e4', from: 'e2', to: 'e4', type: 'نقلة نظرية', icon: '✓', eval: '+0.2', line: 'e4  e5  Nf3  Nc6', progress: 23, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
  { move: 'Nf3', from: 'g1', to: 'f3', type: 'نقلة ممتازة', icon: '★', eval: '+0.3', line: 'Nf3  Nc6  Bb5  a6', progress: 39, fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' },
  { move: 'Bb5', from: 'f1', to: 'b5', type: 'نقلة نظرية قوية', icon: '✦', eval: '+0.3', line: 'Bb5  a6  Ba4  Nf6', progress: 61, fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
  { move: 'Ba4', from: 'b5', to: 'a4', type: 'نقلة نظرية', icon: '✓', eval: '+0.3', line: 'Ba4  Nf6  O-O  Be7', progress: 78, fen: 'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4' },
];

export function ReviewDemo() {
  const [index, setIndex] = useState(2);
  const current = moves[index];
  return (
    <div className="review-demo" aria-label="تجربة مراجعة تفاعلية">
      <div className="discord-strip"><span className="bot-avatar">♞</span><div><strong>SoliChess</strong><small>BOT</small></div><time>الآن</time></div>
      <div className="review-message">
        <div className="review-title"><span>مراجعة مباراة</span><em>Rapid • 10 min</em></div>
        <div className="players"><strong>OSAMA</strong><span>1 — 0</span><strong>ChessMate</strong></div>
        <div className="accuracy-row"><div><small>دقة الأبيض</small><b>91%</b></div><span><i style={{ width: '72%' }} /></span><div><small>دقة الأسود</small><b>84%</b></div></div>
        <div className="demo-content"><ChessBoard fen={current.fen} from={current.from} to={current.to} /><div className="demo-details"><span className="move-index">النقلة {index + 1} من {moves.length}</span><div className={`quality-badge quality-${index}`}><b>{current.icon}</b>{current.type}</div><strong className="current-move">{current.move}</strong><div className="eval-change"><span>تقييم الوضع</span><b>{current.eval}</b></div><div className="best-line"><small>استمرار نظري قانوني</small><code>{current.line}</code></div><div className="move-progress"><span style={{ width: `${current.progress}%` }} /></div></div></div>
        <div className="demo-controls"><Button aria-label="بداية المراجعة" variant="outline" size="icon" onClick={() => setIndex(0)}><RotateCcw /></Button><Button aria-label="النقلة السابقة" variant="outline" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}><ChevronRight /> السابقة</Button><Button aria-label="النقلة التالية" onClick={() => setIndex((value) => Math.min(moves.length - 1, value + 1))} disabled={index === moves.length - 1}>التالية <ChevronLeft /></Button><span><Sparkles /> جرّب الأزرار</span></div>
      </div>
    </div>
  );
}
