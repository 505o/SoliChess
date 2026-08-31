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

  const moveProgress = smoothstep(clamp((progress - 0.08) / 0.36));
  const knockProgress = smoothstep(clamp((progress - 0.46) / 0.22));
  const fallProgress = smoothstep(clamp((progress - 0.7) / 0.2));
  const resultProgress = smoothstep(clamp((progress - 0.38) / 0.16));

  return (
    <section ref={sectionRef} className="checkmate-story" aria-label="مشهد كش ملك تفاعلي">
      <div className="checkmate-sticky">
        <div className="checkmate-media" aria-label="يد تنفذ نقلة Qg7 كش ملك ثم تطيح الملك الأسود">
          <Image
            className="story-frame"
            src="/story/checkmate-legal-1.webp"
            alt="يد تمسك الوزيرة البيضاء على g6 قبل النقلة القانونية"
            fill
            sizes="100vw"
            priority={false}
            style={{ opacity: 1 - moveProgress, transform: `scale(${1 + moveProgress * 0.012})` }}
          />
          <Image
            className="story-frame"
            src="/story/checkmate-legal-2.webp"
            alt="اليد تنقل الوزيرة من g6 إلى g7 لتنفيذ كش ملك"
            fill
            sizes="100vw"
            priority={false}
            style={{ opacity: moveProgress * (1 - knockProgress), transform: `scale(${1.012 - moveProgress * 0.012})` }}
          />
          <Image
            className="story-frame"
            src="/story/checkmate-legal-3.webp"
            alt="اليد نفسها تدفع الملك الأسود بعد تنفيذ Qg7 كش ملك"
            fill
            sizes="100vw"
            priority={false}
            style={{ opacity: knockProgress * (1 - fallProgress), transform: `scale(${1.01 - knockProgress * 0.01})` }}
          />
          <Image
            className="story-frame"
            src="/story/checkmate-legal-4.webp"
            alt="الملك الأسود ساقط والوزيرة على g7 بعد كش ملك قانوني"
            fill
            sizes="100vw"
            priority={false}
            style={{ opacity: fallProgress, transform: `scale(${1.012 - fallProgress * 0.012})` }}
          />
          <div className="story-vignette" aria-hidden="true" />
          <div className="check-flash" style={{ opacity: resultProgress }} aria-hidden="true" />
        </div>

        <div className="checkmate-copy">
          <span className="story-eyebrow">حكمة على الرقعة</span>
          <h2>حين تجد نقلة جيدة<br /><span>ابحث عن نقلة أفضل</span></h2>
          <p>النهاية لا تُحسم بقوة القطعة، بل بدقة المربع الذي تختاره</p>
          <div className="story-steps" aria-label="شرح المشهد">
            <div className={progress >= 0.08 ? 'active' : ''}><b>01</b><span><small>الوضعية</small><strong>Kf6 Qg6 Kh8</strong></span></div>
            <div className={progress >= 0.4 ? 'active' : ''}><b>02</b><span><small>النقلة القانونية</small><strong>Qg7#</strong></span></div>
            <div className={progress >= 0.72 ? 'active' : ''}><b>03</b><span><small>بعد الحسم</small><strong>يسقط الملك</strong></span></div>
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
