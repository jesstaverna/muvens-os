import { ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Sparkles } from 'lucide-react';
import { buildReport, type ReportInput, type Status } from '@/lib/prospecting/report';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { PrintButton } from './PrintButton';
import { SendProposal } from './SendProposal';

const ST: Record<Status, { Icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-ok', label: 'Em dia' }, atencao: { Icon: AlertTriangle, cls: 'text-warn', label: 'Atenção' },
  ausente: { Icon: XCircle, cls: 'text-danger', label: 'Ausente' }, desconhecido: { Icon: HelpCircle, cls: 'text-muted', label: 'Sem dados' },
};
const LEVEL = { alta: 'Oportunidade alta', media: 'Oportunidade média', baixa: 'Oportunidade baixa', indefinida: 'Aguardando análise' } as const;

/** Diagnóstico em formato de landing page, gerado automaticamente a partir da análise pública. */
export function Diagnostico(props: ReportInput & { generatedAt?: string; share?: { token: string; phone?: string | null; email?: string | null } }) {
  const r = buildReport(props);
  return (
    <section id="diagnostico" className="overflow-hidden rounded-2xl border border-line bg-card print:border-0">
      <div className="bg-black px-6 py-8 text-white sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-black"><Sparkles className="h-3.5 w-3.5" strokeWidth={2} />Diagnóstico de presença digital</span>
          <div className="flex flex-wrap items-center gap-2"><PrintButton />{props.share && <SendProposal token={props.share.token} name={props.name} phone={props.share.phone} email={props.share.email} />}</div>
        </div>
        <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">{r.headline}</h2>
        <p className="mt-2 text-sm text-white/70">{[props.category, props.website].filter(Boolean).join(' · ')}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-white/25 px-3 py-1">{LEVEL[r.level]}{r.score != null && ` · ${r.score}/100`}</span>
          {r.service && <span className="rounded-full bg-lime/90 px-3 py-1 font-medium text-black">Sugestão: {SERVICE_LABEL[r.service] ?? r.service}</span>}
        </div>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-10 lg:grid-cols-3">
        {r.pillars.map((p) => { const s = ST[p.status]; return (
          <div key={p.key} className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold">{p.title}</h3><span className={`inline-flex items-center gap-1 text-xs font-medium ${s.cls}`}><s.Icon className="h-4 w-4" strokeWidth={1.8} />{s.label}</span></div>
            <p className="mt-1 text-xs text-muted">{p.summary}</p>
            <ul className="mt-3 space-y-1 text-sm">{p.items.map((x) => <li key={x.label} className="flex items-center gap-2"><span className={x.ok === null ? 'text-muted' : x.ok ? 'text-ok' : 'text-danger'}>{x.ok === null ? '•' : x.ok ? '✓' : '✗'}</span>{x.label}</li>)}</ul>
          </div>); })}
      </div>
      {(r.opportunities.length > 0 || r.strengths.length > 0) && (
        <div className="grid gap-6 border-t border-line p-6 sm:grid-cols-2 sm:p-10">
          {r.opportunities.length > 0 && <div><h3 className="font-semibold">Oportunidades que vimos</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.opportunities.map((o) => <li key={o}>{o}</li>)}</ul></div>}
          {r.strengths.length > 0 && <div><h3 className="font-semibold">O que já está bom</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.strengths.map((o) => <li key={o}>{o}</li>)}</ul></div>}
        </div>
      )}
      <div className="border-t border-line bg-subtle px-6 py-5 text-sm sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">Próximo passo: uma conversa rápida para transformar estes pontos em um plano de ação.</p>
          {props.share && <a href={`/diagnostico/${props.share.token}`} target="_blank" rel="noreferrer noopener" className="no-print inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90">Acessar Diagnóstico Gratuito (Landing Page)<ArrowUpRight className="h-4 w-4" strokeWidth={2} /></a>}
        </div>
        <p className="mt-1 text-xs text-muted">Baseado somente em informações públicas (site, Google). Não substitui uma auditoria completa.{props.generatedAt && ` Gerado em ${props.generatedAt}.`}</p>
      </div>
    </section>
  );
}
