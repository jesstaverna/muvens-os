import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowRight, Globe, Share2, MousePointerClick, BarChart3, Gem } from 'lucide-react';
import { buildReport, type ReportInput, type Status } from '@/lib/prospecting/report';
import { SERVICE_LABEL } from '@/lib/proposal-templates';

const ST: Record<Status, { Icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-emerald-600', label: 'Em dia' }, atencao: { Icon: AlertTriangle, cls: 'text-amber-600', label: 'Atenção' },
  ausente: { Icon: XCircle, cls: 'text-red-600', label: 'Ausente' }, desconhecido: { Icon: HelpCircle, cls: 'text-neutral-500', label: 'Sem dados' },
};
const ICON = { site: Globe, redes: Share2, conversao: MousePointerClick, anuncios: BarChart3, marca: Gem } as const;
const LEVEL = { alta: 'Alto potencial de crescimento', media: 'Bom potencial de melhoria', baixa: 'Base digital sólida', indefinida: 'Diagnóstico' } as const;

/** Landing page do diagnóstico de um prospecto: tema próprio da marca (preto, verde-limão, off-white), independente do tema do sistema. */
export function Landing(props: ReportInput & { generatedAt?: string; whatsapp?: string; email?: string }) {
  const r = buildReport(props);
  const cta = props.whatsapp ? `https://wa.me/${props.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi o diagnóstico da ${props.name} e gostaria de conversar.`)}` : props.email ? `mailto:${props.email}?subject=${encodeURIComponent(`Diagnóstico — ${props.name}`)}` : null;
  const Cta = ({ dark }: { dark?: boolean }) => cta ? <a href={cta} className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90 ${dark ? 'bg-black text-[#DCEA1E]' : 'bg-[#DCEA1E] text-black'}`}>Quero conversar com a Muvens <ArrowRight className="h-4 w-4" strokeWidth={2} /></a> : null;
  const stats = [
    { n: r.score != null ? `${r.score}/100` : '—', l: 'Pontuação de oportunidade' },
    { n: String(props.observations.length), l: 'Pontos de melhoria identificados' },
    { n: String(r.strengths.length), l: 'Itens que já estão bons' },
  ];
  return (
    <div className="min-h-screen bg-[#F7F7F4] text-neutral-900" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="bg-black text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <span className="flex items-center gap-3"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span><span className="sr-only">Muvens Agência</span></span>
          <span className="text-xs uppercase tracking-widest text-white/50">Diagnóstico de presença digital</span>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
          <span className="inline-block rounded-full bg-[#DCEA1E] px-3 py-1 text-xs font-semibold text-black">{LEVEL[r.level]}</span>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{r.headline}</h1>
          <p className="mt-5 max-w-2xl text-base text-white/70 sm:text-lg">Analisamos a presença online de <strong className="text-white">{props.name}</strong>{props.category ? ` (${props.category})` : ''} usando apenas informações públicas e separamos o que está bom e o que pode render mais resultado.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4"><Cta />{r.service && <span className="text-sm text-white/60">Caminho sugerido: <strong className="text-[#DCEA1E]">{SERVICE_LABEL[r.service] ?? r.service}</strong></span>}</div>
          <dl className="mt-12 grid max-w-3xl grid-cols-3 gap-4 border-t border-white/15 pt-6">
            {stats.map((s) => <div key={s.l}><dt className="text-3xl font-semibold text-[#DCEA1E] sm:text-4xl">{s.n}</dt><dd className="mt-1 text-xs text-white/60 sm:text-sm">{s.l}</dd></div>)}
          </dl>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Como está a presença digital hoje</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">Cinco áreas que influenciam diretamente quantos clientes encontram e escolhem {props.name}.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {r.pillars.map((p) => { const s = ST[p.status]; const I = ICON[p.key as keyof typeof ICON]; return (
            <article key={p.key} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-black"><I className="h-5 w-5 text-[#DCEA1E]" strokeWidth={1.8} /></span><span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.cls}`}><s.Icon className="h-4 w-4" strokeWidth={2} />{s.label}</span></div>
              <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{p.summary}</p>
              <ul className="mt-4 space-y-1.5 border-t border-neutral-100 pt-4 text-sm">{p.items.map((x) => <li key={x.label} className="flex items-start gap-2"><span className={`mt-0.5 font-bold ${x.ok === null ? 'text-neutral-400' : x.ok ? 'text-emerald-600' : 'text-red-600'}`}>{x.ok === null ? '•' : x.ok ? '✓' : '✗'}</span><span>{x.label}</span></li>)}</ul>
            </article>); })}
        </div>

        {(r.opportunities.length > 0 || r.strengths.length > 0) && (
          <div className="mt-16 grid gap-6 lg:grid-cols-2">
            {r.opportunities.length > 0 && <section className="rounded-2xl bg-black p-7 text-white"><h2 className="text-xl font-semibold">Oportunidades que encontramos</h2><ul className="mt-4 space-y-3 text-sm text-white/85">{r.opportunities.map((o) => <li key={o} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#DCEA1E]" />{o}</li>)}</ul></section>}
            {r.strengths.length > 0 && <section className="rounded-2xl border border-neutral-200 bg-white p-7"><h2 className="text-xl font-semibold">O que já está funcionando</h2><ul className="mt-4 space-y-3 text-sm">{r.strengths.map((o) => <li key={o} className="flex gap-3"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />{o}</li>)}</ul></section>}
          </div>
        )}

        <section className="mt-16 rounded-3xl bg-[#DCEA1E] px-7 py-12 text-center sm:px-14">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-black sm:text-4xl">Vamos transformar este diagnóstico em um plano de ação?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-black/70 sm:text-base">Uma conversa rápida, sem compromisso, para priorizar o que traz mais resultado primeiro.</p>
          <div className="mt-6"><Cta dark /></div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-neutral-500 sm:px-8">
          <img src="/logo-muvens.svg" alt="Muvens" className="h-6 w-auto rounded bg-black p-1" />
          <p>Baseado somente em informações públicas (site e Google); não substitui uma auditoria completa.{props.generatedAt && ` Gerado em ${props.generatedAt}.`}</p>
        </div>
      </footer>
    </div>
  );
}
