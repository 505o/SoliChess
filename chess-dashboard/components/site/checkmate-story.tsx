'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
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

  const moveProgress = smoothstep(clamp((progress - 0.12) / 0.58));
  const resultProgress = smoothstep(clamp((progress - 0.58) / 0.22));

  return (
    <section ref={sectionRef} className="checkmate-story" aria-label="مشهد كش ملك تفاعلي">
      <div className="checkmate-sticky">
        <div className="checkmate-media" aria-label="يد تضع الوزيرة على رقعة شطرنج ثلاثية الأبعاد ثم يسقط الملك الأسود">
          <Image
            className="story-frame story-frame-before"
            src="/story/checkmate-before.webp"
            alt="يد حقيقية تمسك وزيرة بيضاء فوق رقعة شطرنج ثلاثية الأبعاد"
            fill
            sizes="100vw"
            priority={false}
            style={{ opacity: 1 - moveProgress, transform: `scale(${1 + moveProgress * 0.018}) translateY(${moveProgress * 5}px)` }}
          />
          <Image
            className="story-frame story-frame-after"
            src="/story/checkmate-after.webp"
            alt="الوزيرة البيضاء على الرقعة والملك الأسود ساقط بعد كش ملك"
            fill
            sizes="100vw"
            priority={false}
            style={{ opacity: moveProgress, transform: `scale(${1.025 - moveProgress * 0.025})` }}
          />
          <div className="story-vignette" aria-hidden="true" />
          <div className="check-flash" style={{ opacity: resultProgress }} aria-hidden="true" />
        </div>

        <div className="checkmate-copy">
          <span className="story-eyebrow">لحظة تغيّر المباراة</span>
          <h2>حرّك النزول<br /><span>وشاهد كش الملك</span></h2>
          <p>الوزيرة تنزل على الرقعة الحقيقية، تحسم الوضعية، ويسقط ملك الخصم قدامك</p>
          <div className="story-steps" aria-label="شرح المشهد">
            <div className={progress >= 0.12 ? 'active' : ''}><b>01</b><span><small>التنفيذ</small><strong>ضع الوزيرة</strong></span></div>
            <div className={progress >= 0.48 ? 'active' : ''}><b>02</b><span><small>النقلة</small><strong>Qxh7#</strong></span></div>
            <div className={progress >= 0.72 ? 'active' : ''}><b>03</b><span><small>النتيجة</small><strong>كش ملك</strong></span></div>
          </div>
        </div>

        <div className="mate-result" style={{ opacity: resultProgress, transform: `translateY(${22 * (1 - resultProgress)}px) scale(${0.94 + resultProgress * 0.06})` }}>
          <span>Qxh7#</span>
          <strong>كش ملك</strong>
        </div>
        <div className="story-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
        <span className="scroll-instruction" style={{ opacity: clamp(1 - progress * 3) }}>كمّل نزول</span>
      </div>
    </section>
  );
}
