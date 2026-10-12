import type { ReactElement } from 'react';
// Ilustrações genéricas (SVG próprio, sem imagens de terceiros) por segmento, nas cores da marca.
const L = '#DCEA1E';
const W = 'rgba(255,255,255,.85)';
const D = 'rgba(255,255,255,.14)';

function Industria() { return (<>
  <rect x="0" y="168" width="320" height="2" fill={D} />
  <path d="M30 168V108l34 18V108l34 18V108l34 18v42z" fill={D} stroke={W} strokeWidth="2" strokeLinejoin="round" />
  <rect x="152" y="84" width="60" height="84" fill={D} stroke={W} strokeWidth="2" /><rect x="164" y="104" width="12" height="14" fill={L} /><rect x="188" y="104" width="12" height="14" fill={L} /><rect x="164" y="130" width="12" height="14" fill={L} /><rect x="188" y="130" width="12" height="14" fill={L} />
  <rect x="226" y="56" width="22" height="112" fill={D} stroke={W} strokeWidth="2" /><rect x="262" y="76" width="18" height="92" fill={D} stroke={W} strokeWidth="2" />
  {[0, 1, 2].map((i) => <circle key={i} className="mv-smoke" style={{ animationDelay: `${i * 1.2}s` }} cx={237} cy={50} r={9} fill={W} />)}
  {[0, 1].map((i) => <circle key={i} className="mv-smoke" style={{ animationDelay: `${i * 1.8 + .6}s` }} cx={271} cy={70} r={7} fill={W} />)}
  <g className="mv-spin"><circle cx="86" cy="60" r="16" fill="none" stroke={L} strokeWidth="5" strokeDasharray="7 5" /><circle cx="86" cy="60" r="5" fill={L} /></g>
</>); }
function Pet() { return (<g className="mv-float" transform="translate(110 40)"><ellipse cx="50" cy="92" rx="38" ry="30" fill={L} /><ellipse cx="6" cy="48" rx="13" ry="18" fill={L} transform="rotate(-20 6 48)" /><ellipse cx="34" cy="22" rx="13" ry="18" fill={L} transform="rotate(-6 34 22)" /><ellipse cx="66" cy="22" rx="13" ry="18" fill={L} transform="rotate(6 66 22)" /><ellipse cx="94" cy="48" rx="13" ry="18" fill={L} transform="rotate(20 94 48)" /></g>); }
function Saude() { return (<><circle cx="160" cy="100" r="62" fill={D} stroke={W} strokeWidth="2" /><path d="M146 66h28v28h28v28h-28v28h-28v-28h-28V94h28z" fill={L} /><path className="mv-draw" d="M20 100h60l12-26 18 56 16-40 12 10h60" fill="none" stroke={W} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="translate(40 60) scale(.8)" /></>); }
function Alimentacao() { return (<><circle cx="160" cy="100" r="64" fill={D} stroke={W} strokeWidth="2" /><circle cx="160" cy="100" r="40" fill="none" stroke={L} strokeWidth="4" /><g className="mv-float"><path d="M70 60v50M62 60v24a8 8 0 0 0 16 0V60M70 110v40" stroke={W} strokeWidth="4" strokeLinecap="round" fill="none" /><path d="M250 60c-12 8-12 40 0 48v42M250 60v90" stroke={W} strokeWidth="4" strokeLinecap="round" fill="none" /></g></>); }
function Tecnologia() { return (<><rect x="50" y="36" width="220" height="136" rx="12" fill={D} stroke={W} strokeWidth="2" /><path d="M50 62h220" stroke={W} strokeWidth="2" /><circle cx="68" cy="49" r="4" fill={L} /><circle cx="82" cy="49" r="4" fill={W} /><circle cx="96" cy="49" r="4" fill={W} />
  <rect x="72" y="82" width="90" height="8" rx="4" fill={L} /><rect x="86" y="102" width="130" height="8" rx="4" fill={W} opacity=".6" /><rect x="86" y="122" width="70" height="8" rx="4" fill={W} opacity=".6" /><rect x="72" y="142" width="10" height="14" fill={L} className="mv-blink" /></>); }
function Construcao() { return (<><rect x="0" y="168" width="320" height="2" fill={D} /><rect x="60" y="70" width="90" height="98" fill={D} stroke={W} strokeWidth="2" />{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={72 + c * 26} y={84 + r * 28} width="14" height="16" fill={r === 1 && c === 1 ? L : W} opacity={r === 1 && c === 1 ? 1 : .35} />))}
  <path d="M200 168V40h60M200 40l-30 30M260 40v36" stroke={L} strokeWidth="4" fill="none" strokeLinecap="round" /><g className="mv-float"><rect x="252" y="76" width="16" height="14" fill={W} /></g></>); }
function Logistica() { return (<><rect x="0" y="162" width="320" height="2" fill={D} /><g className="mv-drift"><rect x="40" y="86" width="140" height="70" rx="6" fill={D} stroke={W} strokeWidth="2" /><path d="M180 108h50l26 26v22h-76z" fill={L} /><circle cx="84" cy="160" r="14" fill="#000" stroke={W} strokeWidth="3" /><circle cx="214" cy="160" r="14" fill="#000" stroke={W} strokeWidth="3" /></g></>); }
function Servicos() { return (<><rect x="76" y="72" width="168" height="100" rx="10" fill={D} stroke={W} strokeWidth="2" /><path d="M130 72v-12a8 8 0 0 1 8-8h44a8 8 0 0 1 8 8v12" fill="none" stroke={W} strokeWidth="2" /><path d="M76 112h168" stroke={W} strokeWidth="2" /><rect x="148" y="104" width="24" height="16" rx="3" fill={L} />
  {[34, 52, 70].map((h, i) => <rect key={i} className="mv-float" style={{ animationDelay: `${i * .4}s` }} x={104 + i * 36} y={170 - h} width="20" height={h - 10} fill={i === 2 ? L : W} opacity={i === 2 ? 1 : .5} />)}</>); }
function Padrao() { return (<>{[0, 1, 2, 3, 4].map((i) => <rect key={i} className="mv-float" style={{ animationDelay: `${i * .5}s` }} x={58 + i * 44} y={150 - (i + 1) * 20} width="30" height={(i + 1) * 20} rx="4" fill={i === 4 ? L : W} opacity={i === 4 ? 1 : .35} />)}<path d="M50 120L120 90l50 20 80-60" fill="none" stroke={L} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mv-draw" /></>); }

const MAP: Record<string, () => ReactElement> = { industria: Industria, pet: Pet, saude: Saude, alimentacao: Alimentacao, tecnologia: Tecnologia, construcao: Construcao, logistica: Logistica, servicos: Servicos, agro: Industria };

export function Illustration({ segment, className = '' }: { segment: string; className?: string }) {
  const Pic = MAP[segment] ?? Padrao;
  return <svg viewBox="0 0 320 190" className={className} role="img" aria-label="Ilustração do segmento" fill="none"><Pic /></svg>;
}
