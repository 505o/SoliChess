'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChessBoard } from '@/components/site/chess-board';

const moves = [
  { move: 'e4', type: 'نقلة افتتاحية', icon: '✓', eval: '+0.2', line: 'e4  e5  Nf3  Nc6', progress: 23 },
  { move: 'Nf3', type: 'أفضل نقلة', icon: '★', eval: '+0.4', line: 'Nf3  Nc6  Bb5  a6', progress: 39 },
  { move: 'Bxc6!', type: 'نقلة رائعة', icon: '✦', eval: '+1.4', line: 'Bxc6  dxc6  Nxe5  Be6', progress: 61 },
  { move: 'Qh5?', type: 'خطأ', icon: '!', eval: '-0.6', line: 'Qh5  Nf6  Qe2  Bc5', progress: 78 },
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
        <div className="demo-content"><ChessBoard /><div className="demo-details"><span className="move-index">النقلة {index + 1} من {moves.length}</span><div className={`quality-badge quality-${index}`}><b>{current.icon}</b>{current.type}</div><strong className="current-move">{current.move}</strong><div className="eval-change"><span>تقييم الوضع</span><b>{current.eval}</b></div><div className="best-line"><small>المسار المقترح</small><code>{current.line}</code></div><div className="move-progress"><span style={{ width: `${current.progress}%` }} /></div></div></div>
        <div className="demo-controls"><Button aria-label="بداية المراجعة" variant="outline" size="icon" onClick={() => setIndex(0)}><RotateCcw /></Button><Button aria-label="النقلة السابقة" variant="outline" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}><ChevronRight /> السابقة</Button><Button aria-label="النقلة التالية" onClick={() => setIndex((value) => Math.min(moves.length - 1, value + 1))} disabled={index === moves.length - 1}>التالية <ChevronLeft /></Button><span><Sparkles /> جرّب الأزرار</span></div>
      </div>
    </div>
  );
}
