'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

const squares = {
  whiteKing: { x: 73.78, y: 39.15 },
  queenStart: { x: 78.5, y: 39.15 },
  queenEnd: { x: 77.92, y: 32.81 },
  blackKing: { x: 81.78, y: 26.49 },
};

type SpriteProps = {
  alt: string;
  filterId: string;
  height: number;
  invert?: boolean;
  src: string;
  width: number;
};

function KeyedSprite({ alt, filterId, height, invert = false, src, width }: SpriteProps) {
  const alphaRow = invert
    ? '-0.299 -0.587 -0.114 0 1'
    : '0.299 0.587 0.114 0 0';
  const alphaCurve = invert
    ? '0 0 0 0 0 1'
    : '0 0 0.95 1 1 1';

  return (
    <svg className="story-sprite" viewBox={`0 0 ${width} ${height}`} aria-label={alt}>
      <title>{alt}</title>
      <defs>
        <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            result="keyed"
            values={`1 0 0 0 0
                     0 1 0 0 0
                     0 0 1 0 0
                     ${alphaRow}`}
          />
          <feComponentTransfer in="keyed" result="thresholded">
            <feFuncA type="table" tableValues={alphaCurve} />
          </feComponentTransfer>
          <feComposite in="thresholded" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <image href={src} width={width} height={height} preserveAspectRatio="xMidYMid meet" filter={`url(#${filterId})`} />
    </svg>
  );
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
      const start = window.innerHeight * 0.72;
      const distance = Math.max(window.innerHeight, section.offsetHeight - window.innerHeight * 0.28);
      setProgress(clamp((start - rect.top) / distance));
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

  const moveProgress = smoothstep(clamp((progress - 0.1) / 0.38));
  const approachProgress = smoothstep(clamp((progress - 0.54) / 0.22));
  const fallProgress = smoothstep(clamp((progress - 0.74) / 0.2));
  const resultProgress = smoothstep(clamp((progress - 0.42) / 0.14));

  const queenX = lerp(squares.queenStart.x, squares.queenEnd.x, moveProgress);
  const queenY = lerp(squares.queenStart.y, squares.queenEnd.y, moveProgress)
    - Math.sin(moveProgress * Math.PI) * 1.8;

  const handOnQueenX = queenX - 18.85;
  const handOnQueenY = queenY - 45;
  const handAtKingX = squares.blackKing.x - 18.85;
  const handAtKingY = squares.blackKing.y - 45;
  const handX = lerp(handOnQueenX, handAtKingX, approachProgress) - fallProgress * 0.65;
  const handY = lerp(handOnQueenY, handAtKingY, approachProgress) + fallProgress * 1.1;
  const kingRotation = -84 * fallProgress - Math.sin(fallProgress * Math.PI) * 4;

  return (
    <section ref={sectionRef} className="checkmate-story" aria-label="مشهد كش ملك تفاعلي">
      <div className="checkmate-sticky">
        <div className="checkmate-media" aria-label="الوضعية القانونية Kf6 وQg6 ضد Kh8 ثم النقلة Qg7 كش ملك">
          <div className="story-stage">
            <Image
              className="story-board"
              src="/story/scene-board.webp"
              alt="رقعة شطرنج خشبية حقيقية"
              fill
              sizes="100vw"
              priority={false}
            />

            <svg className="story-move-path" viewBox="0 0 1744 973" aria-hidden="true">
              <path d="M1369 381 C1374 356 1364 337 1359 319" pathLength="1" style={{ strokeDashoffset: 1 - moveProgress }} />
              <circle cx="1359" cy="319" r="23" style={{ opacity: resultProgress }} />
            </svg>

            <span className="story-piece story-white-king" style={{ left: `${squares.whiteKing.x}%`, top: `${squares.whiteKing.y}%` }}>
              <KeyedSprite alt="الملك الأبيض على f6" filterId="key-white-king" src="/story/scene-white-king.webp" width={1254} height={1254} />
            </span>

            <span
              className="story-piece story-white-queen"
              style={{
                left: `${queenX}%`,
                top: `${queenY}%`,
                transform: `translate(-50%, -86%) scale(${1 + Math.sin(moveProgress * Math.PI) * 0.045})`,
              }}
            >
              <KeyedSprite alt="الوزيرة البيضاء تتحرك من g6 إلى g7" filterId="key-white-queen" src="/story/scene-white-queen.webp" width={1122} height={1402} />
            </span>

            <span
              className="story-piece story-black-king"
              style={{
                left: `${squares.blackKing.x}%`,
                top: `${squares.blackKing.y}%`,
                transform: `translate(-50%, -86%) rotate(${kingRotation}deg) translateY(${fallProgress * 5}%)`,
              }}
            >
              <KeyedSprite alt="الملك الأسود على h8" filterId="key-black-king" src="/story/scene-black-king.webp" width={1254} height={1254} invert />
            </span>

            <span
              className="story-hand"
              style={{
                left: `${handX}%`,
                top: `${handY}%`,
                transform: `rotate(${lerp(0, -3.5, approachProgress)}deg) scale(${1 - fallProgress * 0.025})`,
              }}
            >
              <KeyedSprite alt="يد تحرك الوزيرة ثم تطيح الملك" filterId="key-hand" src="/story/scene-hand.webp" width={1254} height={1254} />
            </span>

            <div className="story-vignette" aria-hidden="true" />
            <div className="check-flash" style={{ opacity: resultProgress }} aria-hidden="true" />
          </div>
        </div>

        <div className="checkmate-copy">
          <span className="story-eyebrow">حكمة على الرقعة</span>
          <h2>حين تجد نقلة جيدة<br /><span>ابحث عن نقلة أفضل</span></h2>
          <p>النهاية لا تُحسم بقوة القطعة، بل بدقة المربع الذي تختاره</p>
          <div className="story-steps" aria-label="شرح المشهد">
            <div className={progress >= 0.1 ? 'active' : ''}><b>01</b><span><small>الوضعية القانونية</small><strong>Kf6 Qg6 Kh8</strong></span></div>
            <div className={progress >= 0.42 ? 'active' : ''}><b>02</b><span><small>نقلة الحسم</small><strong>Qg7#</strong></span></div>
            <div className={progress >= 0.76 ? 'active' : ''}><b>03</b><span><small>بعد كش الملك</small><strong>يسقط الملك</strong></span></div>
          </div>
        </div>

        <div className="mate-result" style={{ opacity: resultProgress, transform: `translateY(${22 * (1 - resultProgress)}px) scale(${0.94 + resultProgress * 0.06})` }}>
          <span>Qg7#</span>
          <strong>كش ملك</strong>
        </div>
        <div className="story-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
      </div>
    </section>
  );
}
