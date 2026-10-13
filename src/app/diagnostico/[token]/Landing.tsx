import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowRight, Globe, Share2, MousePointerClick, BarChart3, Gem } from 'lucide-react';
import { buildReport, type ReportInput, type Status } from '@/lib/prospecting/report';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { segmentFor } from '@/lib/prospecting/market';
import { buildProposal, SERVICE_BLURB } from '@/lib/prospecting/proposal';
import { MUVENS } from '@/lib/prospecting/muvens';
import { CountUp, Reveal, ScoreRing } from './Motion';
import { Illustration } from './Illustration';
import { illustrationKey } from '@/lib/prospecting/illustration';

const ST: Record<Status, { Icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-emerald-600', label: 'Em dia' }, atencao: { Icon: AlertTriangle, cls: 'text-amber-600', label: 'Atenção' },
  ausente: { Icon: XCircle, cls: 'text-red-600', label: 'Ausente' }, desconhecido: { Icon: HelpCircle, cls: 'text-neutral-500', label: 'Sem dados' },
};
const ICON = { site: Globe, redes: Share2, conversao: MousePointerClick, anuncios: BarChart3, marca: Gem } as const;
const LEVEL = { alta: 'Alto potencial de crescimento', media: 'Bom potencial de melhoria', baixa: 'Base digital sólida', indefinida: 'Diagnóstico' } as const;

/** Landing page do diagnóstico de um prospecto: tema próprio da marca (preto, verde-limão, off-white), independente do tema do sistema. */
export function Landing(props: ReportInput & { generatedAt?: string; whatsapp?: string; email?: string; prices?: Record<string, { from: number; unit: string }> }) {
  const r = buildReport(props); const seg = segmentFor(props.category); const art = illustrationKey(props.category, seg.key); const steps = buildProposal(r);
  const local = [props.reviews != null && `${props.reviews} avaliações no Google`, props.rating && `nota ${String(props.rating).replace('.', ',')}`].filter(Boolean).join(' · ');
  const cta = props.whatsapp ? `https://wa.me/${props.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi o diagnóstico da ${props.name} e gostaria de conversar.`)}` : props.email ? `mailto:${props.email}?subject=${encodeURIComponent(`Diagnóstico — ${props.name}`)}` : null;
  const Cta = ({ dark }: { dark?: boolean }) => cta ? <a href={cta} className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90 ${dark ? 'bg-black text-[#DCEA1E]' : 'bg-[#DCEA1E] text-black'}`}>Quero conversar com a Muvens <ArrowRight className="h-4 w-4" strokeWidth={2} /></a> : null;
  const hasPrices = !!props.prices && Object.keys(props.prices).length > 0;
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const priceOf = (svc: string) => { const x = props.prices?.[svc]; return x ? `A partir de ${brl(Number(x.from))}${x.unit === 'mensal' ? ' / mês' : ''}` : 'Sob consulta'; };
  const ctaFor = (label: string) => props.whatsapp ? `https://wa.me/${props.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi o diagnóstico da ${props.name} e tenho interesse em: ${label}.`)}` : props.email ? `mailto:${props.email}?subject=${encodeURIComponent(`Interesse em ${label} — ${props.name}`)}` : null;
  const planned = new Set(steps.map((x) => x.service));
  const offers = Object.entries(props.prices ?? {}).map(([svc, v]) => ({ svc, v })).sort((a, b) => Number(planned.has(b.svc)) - Number(planned.has(a.svc)));
  const stats = [
    { num: r.score, l: 'Pontuação de oportunidade' },
    { num: props.observations.length, l: 'Pontos de melhoria identificados' },
    ...(r.strengths.length ? [{ num: r.strengths.length, l: 'Itens que já estão bons' }] : []),
  ];
  return (
    <div className="min-h-screen bg-[#F7F7F4] pb-20 text-neutral-900 sm:pb-0" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="relative overflow-hidden bg-black text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0"><div className="mv-drift absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#DCEA1E]/10 blur-3xl" /><div className="mv-drift absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-[#DCEA1E]/5 blur-3xl" style={{ animationDelay: '-4s' }} /><Illustration segment={art} className="absolute -bottom-2 right-6 hidden w-[380px] opacity-40 lg:block" /></div>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <span className="flex items-center gap-3"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span><span className="sr-only">Muvens Agência</span></span>
          <span className="hidden text-xs uppercase tracking-widest text-white/50 lg:inline">Diagnóstico gratuito de presença digital</span>{cta && <a href={cta} className="hidden items-center gap-1.5 rounded-full bg-[#DCEA1E] px-4 py-2 text-xs font-semibold text-black hover:opacity-90 sm:inline-flex">Falar com a Muvens <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} /></a>}
        </div>
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
          <span className="mv-rise inline-block rounded-full bg-[#DCEA1E] px-3 py-1 text-xs font-semibold text-black">{LEVEL[r.level]}</span>
          <h1 style={{ animationDelay: '.12s' }} className="mv-rise mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{r.headline}</h1>
          <p style={{ animationDelay: '.24s' }} className="mv-rise mt-5 max-w-2xl text-base text-white/70 sm:text-lg">Analisamos a presença online de <strong className="text-white">{props.name}</strong>{props.category ? ` (${props.category})` : ''} usando apenas informações públicas e separamos o que está bom e o que pode render mais resultado.</p>
          <div style={{ animationDelay: '.36s' }} className="mv-rise mt-8 flex flex-wrap items-center gap-4"><Cta />{r.service && <span className="text-sm text-white/60">Caminho sugerido: <strong className="text-[#DCEA1E]">{SERVICE_LABEL[r.service] ?? r.service}</strong></span>}</div>
          <div style={{ animationDelay: '.5s' }} className="mv-rise mt-12 flex flex-wrap items-center gap-8 border-t border-white/15 pt-8">
            {r.score != null && <ScoreRing score={r.score} />}
            <dl className="grid grid-cols-2 gap-8">
              {stats.filter((x) => x.num !== null && x.l !== 'Pontuação de oportunidade').map((x) => <div key={x.l}><dt className="text-4xl font-semibold text-[#DCEA1E]"><CountUp to={x.num!} /></dt><dd className="mt-1 max-w-[11rem] text-xs text-white/60 sm:text-sm">{x.l}</dd></div>)}
            </dl>
            <p className="max-w-[12rem] text-xs text-white/50">Pontuação de oportunidade: quanto maior, mais espaço para melhorar.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        {!r.hasSite || !r.reachable ? (
          <section className="rounded-3xl border border-neutral-200 bg-white p-7 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{!r.hasSite ? 'Hoje, quem procura a empresa no Google não encontra um site' : 'O site não abriu durante a nossa análise'}</h2>
            <p className="mt-3 max-w-3xl text-neutral-700">{!r.hasSite ? 'Sem site, a empresa depende só de indicação e de perfis em terceiros. Quem pesquisa para comparar fornecedores segue para o concorrente que aparece primeiro e passa mais confiança.' : 'Um site fora do ar ou lento faz o cliente desistir em segundos. Vale confirmar o motivo e corrigir antes de investir em divulgação.'}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">{['Clientes não conseguem conferir serviços e contato', 'Anúncios e redes não têm para onde levar o interesse', 'A marca perde credibilidade frente a quem tem site'].map((t) => <li key={t} className="flex gap-3 rounded-xl bg-[#F7F7F4] p-4 text-sm"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={2} />{t}</li>)}</ul>
            <p className="mt-6 text-sm text-neutral-600">Redes sociais, conversão e anúncios só podem ser medidos depois que houver um site no ar.</p>
            {r.pillars.filter((p) => p.key === 'marca').map((p) => <div key={p.key} className="mt-6 rounded-xl border border-neutral-200 p-4"><h3 className="font-semibold">{p.title}</h3><ul className="mt-2 space-y-1 text-sm">{p.items.filter((x) => x.ok !== null).map((x) => <li key={x.label} className="flex gap-2"><span className={x.ok ? 'text-emerald-600' : 'text-red-600'}>{x.ok ? '✓' : '✗'}</span>{x.label}</li>)}</ul></div>)}
          </section>
        ) : (<>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Como está a presença digital hoje</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">Cinco áreas que influenciam diretamente quantos clientes encontram e escolhem {props.name}.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {r.pillars.map((p, pi) => { const s = ST[p.status]; const I = ICON[p.key as keyof typeof ICON]; return (
            <Reveal key={p.key} delay={pi * 80}><article className="h-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-black"><I className="h-5 w-5 text-[#DCEA1E]" strokeWidth={1.8} /></span><span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.cls}`}><s.Icon className="h-4 w-4" strokeWidth={2} />{s.label}</span></div>
              <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{p.summary}</p>
              <ul className="mt-4 space-y-1.5 border-t border-neutral-100 pt-4 text-sm">{p.items.map((x) => <li key={x.label} className="flex items-start gap-2"><span className={`mt-0.5 font-bold ${x.ok === null ? 'text-neutral-400' : x.ok ? 'text-emerald-600' : 'text-red-600'}`}>{x.ok === null ? '•' : x.ok ? '✓' : '✗'}</span><span>{x.label}</span></li>)}</ul>
            </article></Reveal>); })}
        </div>

        </>)}

        {(r.opportunities.length > 0 || r.strengths.length > 0) && (
          <div className={`mt-16 grid gap-6 ${r.opportunities.length > 0 && r.strengths.length > 0 ? 'lg:grid-cols-2' : ''}`}>
            {r.opportunities.length > 0 && <section className="rounded-2xl bg-black p-7 text-white"><h2 className="text-xl font-semibold">Oportunidades que encontramos</h2><ul className="mt-4 space-y-3 text-sm text-white/85">{r.opportunities.map((o) => <li key={o} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#DCEA1E]" />{o}</li>)}</ul></section>}
            {r.strengths.length > 0 && <section className="rounded-2xl border border-neutral-200 bg-white p-7"><h2 className="text-xl font-semibold">O que já está funcionando</h2><ul className="mt-4 space-y-3 text-sm">{r.strengths.map((o) => <li key={o} className="flex gap-3"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />{o}</li>)}</ul></section>}
          </div>
        )}

        <Reveal>
        <section className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Panorama do segmento · {seg.label}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">O que costuma pesar na escolha dos clientes</h2>
          <p className="mt-3 max-w-3xl text-neutral-700">{seg.behavior}</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-4"><div className="grid place-items-center rounded-2xl bg-black p-5 lg:col-span-1"><Illustration segment={art} className="w-full max-w-[260px]" /></div><div className="grid gap-4 lg:col-span-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 lg:col-span-2"><h3 className="font-semibold">Tendências do segmento</h3><ul className="mt-3 space-y-2 text-sm">{seg.trends.map((t) => <li key={t} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-black" />{t}</li>)}</ul></div>
            <div className="rounded-2xl bg-black p-6 text-white"><h3 className="font-semibold">Onde focar</h3><ul className="mt-3 space-y-2 text-sm text-white/85">{seg.focus.map((t) => <li key={t} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#DCEA1E]" />{t}</li>)}</ul>{local && <p className="mt-4 border-t border-white/15 pt-3 text-xs text-white/60">{props.name} hoje: {local}.</p>}</div>
          </div></div>
          <p className="mt-3 text-xs text-neutral-500">Visão geral qualitativa do segmento, sem dados numéricos; não substitui um estudo de mercado.</p>
        </section>
        </Reveal>

        <Reveal>
        <section className="mt-16 rounded-3xl bg-black px-7 py-12 text-white sm:px-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#DCEA1E]">Quem é a Muvens</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-semibold leading-tight sm:text-4xl">{MUVENS.tagline}</h2>
          <p className="mt-4 max-w-3xl text-white/70">{MUVENS.about}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{MUVENS.pillars.map((x) => <div key={x.title} className="rounded-xl border border-white/15 p-4"><h3 className="text-sm font-semibold text-[#DCEA1E]">{x.title}</h3><p className="mt-1 text-xs text-white/65">{x.text}</p></div>)}</div>
        </section>
        </Reveal>

        <Reveal>
        <section className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Proposta de melhorias</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Plano sugerido para {props.name}</h2>
          <p className="mt-2 max-w-2xl text-neutral-600">Ordenado pelo que mais pesa no diagnóstico. {hasPrices ? 'Valores de referência; a proposta final depende de um breve briefing.' : 'Valores e prazos definimos juntos, depois de uma conversa.'}</p>
          {r.b2bStructured && <div className="mt-6 rounded-2xl border border-black bg-black p-6 text-white"><p className="text-xs font-semibold uppercase tracking-widest text-[#DCEA1E]">Por que automação e IA para {props.name}</p><p className="mt-2 max-w-3xl text-sm text-white/80">Empresas que vendem para outras empresas têm ciclo de venda mais longo e várias pessoas na decisão. Organizar a captação e o acompanhamento dos contatos (RD Station), automatizar o funil comercial e usar IA no atendimento e na prospecção ajuda a não perder oportunidades e a liberar o tempo do time comercial.</p></div>}
          <ol className="mt-8 space-y-4">{steps.map((st, i) => (
            <li key={st.title}><Reveal delay={i * 60}><div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-6 sm:grid-cols-[auto_1fr]">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#DCEA1E] text-lg font-semibold text-black">{i + 1}</span>
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{st.title}</h3><span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">Etapa {st.phase} · {SERVICE_LABEL[st.service] ?? st.service}</span>{hasPrices && <span className="rounded-full bg-black px-2.5 py-0.5 text-xs font-medium text-[#DCEA1E]">{priceOf(st.service)}</span>}</div>
                <p className="mt-1 text-sm text-neutral-600">{st.why}</p>
                <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">{st.deliverables.map((d) => <li key={d} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />{d}</li>)}</ul></div>
            </div></Reveal></li>))}</ol>
        </section>
        </Reveal>

        {hasPrices && offers.length > 0 && (
          <section className="mt-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Serviços e valores de referência</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Como a Muvens pode ajudar</h2>
            <p className="mt-2 max-w-2xl text-neutral-600">Você pode contratar um serviço ou combinar vários. Os valores abaixo são de referência, a partir de; a proposta final depende de um breve briefing.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map(({ svc, v }, oi) => { const label = SERVICE_LABEL[svc] ?? svc; const link = ctaFor(label); const rec = planned.has(svc); return (
                <Reveal key={svc} delay={(oi % 3) * 90}><article className={`flex h-full flex-col rounded-2xl border p-6 ${rec ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white'}`}>
                  {rec && <span className="mb-3 w-fit rounded-full bg-[#DCEA1E] px-2.5 py-0.5 text-xs font-semibold text-black">Indicado para {props.name.split(' ')[0]}</span>}
                  <h3 className="text-lg font-semibold">{label}</h3>
                  <p className={`mt-1 flex-1 text-sm ${rec ? 'text-white/70' : 'text-neutral-600'}`}>{SERVICE_BLURB[svc] ?? ''}</p>
                  <p className="mt-4 text-sm">A partir de</p><p className={`text-3xl font-semibold ${rec ? 'text-[#DCEA1E]' : ''}`}>{brl(Number(v.from))}<span className="text-sm font-normal opacity-70">{v.unit === 'mensal' ? ' / mês' : ''}</span></p>
                  {link && <a href={link} className={`mt-4 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold hover:opacity-90 ${rec ? 'bg-[#DCEA1E] text-black' : 'bg-black text-[#DCEA1E]'}`}>Tenho interesse <ArrowRight className="h-4 w-4" strokeWidth={2} /></a>}
                </article></Reveal>); })}
            </div>
          </section>
        )}

        <Reveal>
        <section className="mt-16 rounded-3xl bg-[#DCEA1E] px-7 py-12 text-center sm:px-14">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-black sm:text-4xl">Vamos transformar este diagnóstico em um plano de ação?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-black/70 sm:text-base">Uma conversa rápida, sem compromisso, para priorizar o que traz mais resultado primeiro.</p>
          <div className="mt-6"><Cta dark /></div>
        </section>
        </Reveal>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-neutral-500 sm:px-8">
          <img src="/logo-muvens.svg" alt="Muvens" className="h-6 w-auto rounded bg-black p-1" />
          <p>Baseado somente em informações públicas (site e Google); não substitui uma auditoria completa.{props.generatedAt && ` Gerado em ${props.generatedAt}.`} <a href="/privacidade" className="underline">Privacidade</a></p>
        </div>
      </footer>
    {cta && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 p-3 sm:hidden"><a href={cta} className="flex items-center justify-center gap-2 rounded-full bg-[#DCEA1E] px-5 py-3 text-sm font-semibold text-black">Quero conversar com a Muvens <ArrowRight className="h-4 w-4" strokeWidth={2} /></a></div>}
    </div>
  );
}
