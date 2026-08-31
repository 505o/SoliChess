'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const pieces = [
  { square: 'g8', piece: 'bK', label: 'ملك أسود' },
  { square: 'f7', piece: 'bP', label: 'بيدق أسود' },
  { square: 'g7', piece: 'bP', label: 'بيدق أسود' },
  { square: 'h7', piece: 'bP', label: 'بيدق أسود', captured: true },
  { square: 'h5', piece: 'wQ', label: 'وزير أبيض', moving: true },
  { square: 'b4', piece: 'wB', label: 'فيل أبيض' },
  { square: 'd3', piece: 'wB', label: 'فيل أبيض' },
  { square: 'e1', piece: 'wK', label: 'ملك أبيض' },
];

function squarePosition(square: string) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return { left: `${file * 12.5}%`, top: `${(8 - rank) * 12.5}%` };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function CheckmateStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      const reducedFrame = window.requestAnimationFrame(() => setProgress(1));
      return () => window.cancelAnimationFrame(reducedFrame);
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const distance = Math.max(1, section.offsetHeight - window.innerHeight);
      setProgress(clamp(-rect.top / distance));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const queenProgress = clamp((progress - 0.18) / 0.42);
  const captureProgress = clamp((progress - 0.52) / 0.12);
  const kingProgress = clamp((progress - 0.66) / 0.24);

  return (
    <section ref={sectionRef} className="checkmate-story" aria-label="مشهد كش ملك تفاعلي">
      <div className="checkmate-sticky section-wrap">
        <div className="checkmate-copy">
          <span className="story-eyebrow">لحظة تغيّر المباراة</span>
          <h2>النقلة مو مجرد رمز<br /><span>خلّك تشوف تأثيرها</span></h2>
          <p>انزل بهدوء وشاهد الوزيرة تنفذ نقلة قانونية، تحاصر الملك، وتنهي المباراة بكش ملك</p>
          <div className="story-steps" aria-label="شرح المشهد">
            <div className={progress >= 0.18 ? 'active' : ''}><b>01</b><span><small>النقلة</small><strong>Qxh7#</strong></span></div>
            <div className={progress >= 0.58 ? 'active' : ''}><b>02</b><span><small>النتيجة</small><strong>كش ملك</strong></span></div>
            <div className={progress >= 0.82 ? 'active' : ''}><b>03</b><span><small>الشرح</small><strong>ليش كانت حاسمة</strong></span></div>
          </div>
        </div>

        <div className="checkmate-stage" aria-label="الوضعية قبل تنفيذ Qxh7 كش ملك">
          <div className="stage-glow" aria-hidden="true" />
          <div className="cinema-board" aria-hidden="true">
            {Array.from({ length: 64 }, (_, index) => {
              const row = Math.floor(index / 8);
              const column = index % 8;
              return <span className={(row + column) % 2 === 0 ? 'cinema-light' : 'cinema-dark'} key={index} />;
            })}
            {pieces.map((item) => {
              const position = squarePosition(item.square);
              const style = item.moving
                ? { ...position, transform: `translateY(${-200 * queenProgress}%) scale(${1 + queenProgress * 0.08})` }
                : item.piece === 'bK'
                  ? { ...position, transform: `translate(${18 * kingProgress}%, ${28 * kingProgress}%) rotate(${92 * kingProgress}deg)`, opacity: 1 - kingProgress * 0.28 }
                  : { ...position, opacity: item.captured ? 1 - captureProgress : 1 };
              return (
                <Image
                  key={`${item.square}-${item.piece}`}
                  className={`cinema-piece ${item.moving ? 'cinema-queen' : ''} ${item.piece === 'bK' ? 'cinema-king' : ''}`}
                  src={`/pieces/${item.piece}.svg`}
                  alt={item.label}
                  width={160}
                  height={160}
                  draggable={false}
                  unoptimized
                  style={style}
                />
              );
            })}
            <span className="mate-square" style={{ opacity: queenProgress }} />
          </div>
          <div className="mate-burst" style={{ opacity: kingProgress, transform: `translate(-50%, -50%) scale(${0.7 + kingProgress * 0.3})` }} aria-hidden="true" />
          <div className="mate-result" style={{ opacity: kingProgress, transform: `translateY(${18 * (1 - kingProgress)}px)` }}>
            <span>Qxh7#</span>
            <strong>كش ملك</strong>
          </div>
          <span className="scroll-instruction" style={{ opacity: 1 - progress * 2.2 }}>انزل لتنفذ النقلة</span>
        </div>
      </div>
    </section>
  );
}
