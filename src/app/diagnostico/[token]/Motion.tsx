'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Aparece suavemente ao rolar. Sem JavaScript (ou com "menos movimento") o conteúdo fica visível normalmente. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'' | 'reveal' | 'reveal in'>('');
  useEffect(() => {
    const el = ref.current; if (!el || reduced() || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // já visível: não anima
    setState('reveal');
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setTimeout(() => setState('reveal in'), delay); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, [delay]);
  return <div ref={ref} className={`${state} ${className}`}>{children}</div>;
}

/** Número que sobe até o valor final quando aparece na tela. */
export function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null); const [n, setN] = useState(to);
  useEffect(() => {
    const el = ref.current; if (!el || reduced() || typeof IntersectionObserver === 'undefined') return;
    setN(0);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now(), D = 1100;
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / D); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{n}{suffix}</span>;
}

/** Anel de pontuação que se preenche. */
export function ScoreRing({ score }: { score: number }) {
  const [v, setV] = useState(score);
  useEffect(() => { if (reduced()) return; setV(0); const id = requestAnimationFrame(() => setTimeout(() => setV(score), 150)); return () => cancelAnimationFrame(id); }, [score]);
  const R = 52, C = 2 * Math.PI * R;
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Pontuação ${score} de 100`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90"><circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="9" />
        <circle cx="60" cy="60" r={R} fill="none" stroke="#DCEA1E" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)' }} /></svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-3xl font-semibold text-[#DCEA1E]"><CountUp to={score} /></div><div className="-mt-0.5 text-[10px] uppercase tracking-widest text-white/60">de 100</div></div></div>
    </div>
  );
}
