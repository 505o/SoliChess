import {
  ArrowLeft,
  Bot,
  Check,
  ChevronLeft,
  CircleUserRound,
  Crown,
  LockKeyhole,
  MessageCircleMore,
  Puzzle,
  Radar,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChessBoard } from '@/components/site/chess-board';
import { ReviewDemo } from '@/components/site/review-demo';

const features = [
  {
    icon: ScanSearch,
    label: 'مراجعة ذكية',
    title: 'كل نقلة تصير مفهومة',
    text: 'شاهد أفضل نقلة، الأخطاء، الفرص الضائعة، ودقة لعبك في مراجعة واضحة داخل ديسكورد',
    accent: 'emerald',
  },
  {
    icon: Puzzle,
    label: 'ألغاز خاصة ويومية',
    title: 'تحديات ما تكشف إجابتك',
    text: 'كل لاعب يحل بسرية، والنتائج تظهر بعد انتهاء الجولة مع عدد الإجابات الصحيحة والمحاولات',
    accent: 'gold',
  },
  {
    icon: Trophy,
    label: 'رتب تلقائية',
    title: 'تصنيفك يتكلم عنك',
    text: 'رولات مبنية على تصنيفات الرابيد والبلتز والبولت، وتتحدث تلقائيًا من حسابك المرتبط',
    accent: 'blue',
  },
];

const ratings = [
  { name: 'Rapid', value: '1842', delta: '+38', tone: 'bg-[#7fd6a6]' },
  { name: 'Blitz', value: '1729', delta: '+21', tone: 'bg-[#a78bfa]' },
  { name: 'Bullet', value: '1658', delta: '+14', tone: 'bg-[#7da8f5]' },
];

const steps = [
  { number: '01', title: 'اربط حسابك', text: 'تسجيل رسمي وآمن بحساب Chess.com بدون كلمات مرور داخل البوت', icon: CircleUserRound },
  { number: '02', title: 'خذ رتبتك', text: 'يتحقق SoliChess من تصنيفاتك ويفتح لك السيرفر والرولات المستحقة', icon: ShieldCheck },
  { number: '03', title: 'طوّر لعبك', text: 'حل ألغاز، راجع مبارياتك، ونافس أصحابك من مكان واحد', icon: Swords },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#09100d] text-[#f6f2e8]">
      <nav className="site-nav" aria-label="التنقل الرئيسي">
        <a href="#top" className="brand" aria-label="SoliChess - الرئيسية">
          <span className="brand-mark" aria-hidden="true">♞</span>
          <span>SoliChess</span>
        </a>
        <div className="nav-links">
          <a href="#features">المزايا</a>
          <a href="#review">المراجعة</a>
          <a href="#how">كيف يعمل؟</a>
        </div>
        <Button nativeButton={false} render={<a href="#launch" aria-label="انتقل إلى قسم تجربة SoliChess" />} className="nav-cta h-10 rounded-full bg-[#4fe1bc] px-5 font-extrabold !text-[#06251c] hover:bg-[#79edd0]">
          جرّب SoliChess <ArrowLeft className="size-4" />
        </Button>
      </nav>

      <section id="top" className="hero-section">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <Badge className="hero-kicker"><span className="live-dot" /> رفيق الشطرنج داخل ديسكورد</Badge>
          <h1>العب، راجع<br /><span>وتقدّم نقلة بنقلة</span></h1>
          <p>SoliChess يحوّل سيرفرك إلى نادي شطرنج متكامل: مراجعة مباريات، ألغاز تنافسية، تصنيفات موثّقة، وتجربة مصممة للاعبين</p>
          <div className="hero-actions">
            <Button nativeButton={false} render={<a href="#launch" aria-label="انتقل إلى قسم إضافة البوت" />} className="primary-link h-13 rounded-full bg-[#4fe1bc] px-7 text-base font-extrabold !text-[#06251c] shadow-[0_0_30px_rgba(79,225,188,.2)] hover:bg-[#79edd0]">
              أضف البوت لسيرفرك <ArrowLeft className="size-5" />
            </Button>
            <Button nativeButton={false} render={<a href="#review" aria-label="شاهد نموذج مراجعة المباراة" />} variant="outline" className="h-13 rounded-full border-white/12 bg-white/5 px-7 text-base text-white hover:bg-white/10">شاهد المراجعة</Button>
          </div>
          <div className="trust-row" aria-label="مزايا أساسية">
            <span><Check /> ربط موثّق</span><span><Check /> عربي بالكامل</span><span><Check /> خفيف وسريع</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="معاينة لوحة مراجعة مباراة">
          <div className="floating-pill pill-one"><Sparkles /> نقلة رائعة</div>
          <div className="floating-pill pill-two"><Zap /> دقة 91%</div>
          <div className="board-shell">
            <div className="board-topline"><div><span className="status-dot" /> مراجعة مباشرة</div><span>18 / 42</span></div>
            <div className="hero-board-wrap"><ChessBoard compact from="f1" to="b5" /><div className="eval-bar" aria-label="تقييم الوضعية +0.3"><span style={{ height: '54%' }} /><b>+0.3</b></div></div>
            <div className="move-card"><span className="move-icon">★</span><div><small>نقلة نظرية قوية</small><strong>Bb5</strong></div><div className="move-line">Bb5&nbsp;&nbsp; a6&nbsp;&nbsp; Ba4&nbsp;&nbsp; Nf6</div></div>
          </div>
        </div>

        <a className="scroll-cue" href="#features" aria-label="انتقل إلى المزايا"><span>اكتشف أكثر</span><ChevronLeft /></a>
      </section>

      <section id="features" className="section-wrap features-section">
        <div className="section-heading">
          <Badge className="section-badge">مصمم لمجتمعك</Badge>
          <h2>كل اللي يحتاجه لاعب الشطرنج، <span>في بوت واحد</span></h2>
          <p>أوامر أقل، وضوح أكثر، وتجربة تخلي أعضاء السيرفر يرجعون كل يوم</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className={`feature-card feature-${feature.accent}`} key={feature.title}>
                <div className="feature-icon"><Icon /></div><span>{feature.label}</span><h3>{feature.title}</h3><p>{feature.text}</p>
                <div className="feature-visual" aria-hidden="true">
                  {feature.accent === 'emerald' && <><div className="mini-move"><b>★</b><span><strong>Qd7!</strong><small>أفضل نقلة</small></span><em>+2.1</em></div><div className="mini-move muted"><b>!</b><span><strong>c6</strong><small>نقلة جيدة</small></span><em>+0.7</em></div></>}
                  {feature.accent === 'gold' && <div className="puzzle-preview"><div className="puzzle-board"><ChessBoard fen="6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" from="d1" to="d8" showArrow={false} /></div><div className="puzzle-meta"><span>الأبيض يلعب</span><strong>مات في نقلة</strong><i>الحل سري</i></div><b>5 / 3</b></div>}
                  {feature.accent === 'blue' && ratings.map((rating) => <div className="rating-row" key={rating.name}><i className={rating.tone} /><span>{rating.name}</span><strong>{rating.value}</strong><em>{rating.delta}</em></div>)}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="review" className="review-section">
        <div className="section-wrap review-layout">
          <div className="review-copy">
            <Badge className="section-badge">مراجعة تفاعلية</Badge>
            <h2>مو بس يقول لك إنك أخطأت، <span>يوريك ليه</span></h2>
            <p>تنقّل بين النقلات، شاهد المسار الأفضل، وافهم تغيّر التقييم بدون ما تغادر ديسكورد، التجربة سريعة وواضحة حتى على الجوال</p>
            <ul>
              <li><span>01</span><div><strong>تصنيف كل نقلة</strong><small>رائعة، ممتازة، جيدة، خطأ أو هفوة</small></div></li>
              <li><span>02</span><div><strong>مسار التحسين</strong><small>الخط المقترح يظهر بشكل مرتب وسهل</small></div></li>
              <li><span>03</span><div><strong>ملخص كامل</strong><small>الدقة، متوسط الخسارة، وأهم لحظات المباراة</small></div></li>
            </ul>
          </div>
          <ReviewDemo />
        </div>
      </section>

      <section id="how" className="section-wrap how-section">
        <div className="section-heading compact-heading"><Badge className="section-badge">ثلاث خطوات فقط</Badge><h2>من دخول السيرفر إلى أول تحدي</h2></div>
        <div className="steps-grid">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return <article className="step-card" key={step.number}><div className="step-head"><span>{step.number}</span><Icon /></div><h3>{step.title}</h3><p>{step.text}</p>{index < steps.length - 1 && <ArrowLeft className="step-arrow" aria-hidden="true" />}</article>;
          })}
        </div>
      </section>

      <section className="community-section">
        <div className="section-wrap community-grid">
          <div><Badge className="section-badge">منافسة يومية</Badge><h2>لغز واحد، إجابات سرية، <span>فائز واحد</span></h2><p>تحديات تلقائية كل 6 أو 12 ساعة، مع لوحة نتائج تحفظ الحماس وتمنع الغش</p></div>
          <div className="leaderboard" aria-label="مثال لترتيب التحدي اليومي">
            <div className="leaderboard-head"><span>تحدي اليوم</span><Badge>ينتهي بعد 03:42:18</Badge></div>
            {[
              ['1', 'OSAMA', 'إجابة صحيحة', '0 أخطاء'], ['2', 'RookMaster', 'إجابة صحيحة', '1 خطأ'], ['3', 'Knight7', 'قيد المحاولة', '2 خطأ'],
            ].map((player, index) => <div className="player-row" key={player[1]}><b className={index === 0 ? 'winner' : ''}>{player[0]}</b><span className="player-avatar">{player[1][0]}</span><strong>{player[1]}</strong><small>{player[2]}</small><em>{player[3]}</em></div>)}
          </div>
        </div>
      </section>

      <section id="launch" className="section-wrap launch-section">
        <div className="launch-card">
          <div className="launch-pattern" aria-hidden="true">♙ ♟ ♘ ♜ ♕</div><div className="launch-icon"><Bot /></div>
          <Badge className="launch-badge"><Radar /> قريبًا</Badge><h2>جاهز تخلي سيرفرك<br />يلعب بشكل أذكى؟</h2><p>قريبًا بعد اكتمال اعتماد الربط الرسمي، خلك أول من يجرب SoliChess</p>
          <Button disabled className="h-13 rounded-full bg-[#0b1510] px-8 text-base font-bold text-white opacity-100 hover:bg-[#17251c]"><MessageCircleMore /> رابط الإضافة بعد الاعتماد</Button>
          <span className="launch-note"><LockKeyhole /> لا نطلب أو نخزّن كلمة مرور حسابك</span>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner"><a href="#top" className="brand"><span className="brand-mark">♞</span><span>SoliChess</span></a><p>بوت شطرنج عربي، مبني للمجتمعات اللي تحب تنافس وتتطور</p><div><a href="#features">المزايا</a><a href="#review">المراجعة</a><a href="#how">طريقة العمل</a></div></div>
        <div className="footer-bottom"><span>© 2026 SoliChess</span><span><Crown /> العب بذكاء، استمتع أكثر</span></div>
      </footer>
    </main>
  );
}
