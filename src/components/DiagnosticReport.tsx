import type { DiagnosticReport } from '@/lib/diagnostics';
import { DIAGNOSTIC_AREAS } from '@/lib/diagnostics';

const PRIORITY = {alta:'Alta prioridade',media:'Média prioridade',baixa:'Baixa prioridade'};
export function DiagnosticReport({company,report,publishedAt}:{company:string;report:DiagnosticReport;publishedAt?:string|null}) {
  const date = publishedAt ? new Date(publishedAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}) : null;
  return (
    <article className="overflow-hidden rounded-[28px] bg-[#F8F8F5] text-[#111]" style={{fontFamily:'Helvetica Neue, Helvetica, Arial, sans-serif'}}>
      <header className="relative bg-[#0A0A0A] px-6 pb-12 pt-6 text-white sm:px-12 sm:pb-20 sm:pt-10">
        <div className="flex items-center justify-between gap-4 border-b border-white/20 pb-6">
          <div className="flex items-center gap-2"><img src="/logo-muvens.svg" className="h-8 w-8" alt="" /><span className="text-base font-semibold tracking-[.15em]">MUVENS</span></div>
          <span className="text-[11px] uppercase tracking-widest text-white/60">Diagnóstico estratégico</span>
        </div>
        <div className="max-w-4xl pt-14">
          <span className="rounded-full bg-[#DCEA1E] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-black">Análise personalizada</span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">{report.headline}</h1>
          <p className="mt-5 text-lg text-white/75">{company}</p>
          {date && <p className="mt-6 text-xs text-white/50">Relatório publicado em {date}</p>}
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-12 sm:px-12 sm:py-20">
        <section className="max-w-4xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">Visão geral</p>
          <h2 className="mb-5 text-2xl font-semibold sm:text-3xl">Oportunidades para fortalecer sua presença digital.</h2>
          <p className="whitespace-pre-wrap text-base leading-8 text-neutral-700">{report.executive_summary}</p>
        </section>
        {report.sections.map((section,index)=>(
          <section key={section.area} className="border-t border-neutral-200 pt-10">
            <div className="mb-7 flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#DCEA1E] text-sm font-bold">{String(index+1).padStart(2,'0')}</span>
              <h2 className="text-2xl font-semibold sm:text-3xl">{DIAGNOSTIC_AREAS[section.area]}</h2>
            </div>
            {!!section.strengths.length && (
              <div className="mb-7 rounded-2xl border border-neutral-200 bg-white p-6">
                <h3 className="mb-3 font-semibold">O que está funcionando</h3>
                <ul className="space-y-2 text-sm leading-6 text-neutral-700">{section.strengths.map((s,i)=><li key={i} className="flex gap-3"><span className="font-bold text-emerald-600">✓</span>{s}</li>)}</ul>
              </div>
            )}
            {section.findings.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {section.findings.map((item,i)=>(
                  <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <span className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{PRIORITY[item.priority]}</span>
                    <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-neutral-500">O que observamos</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-700">{item.evidence}</p>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-neutral-500">Impacto possível</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-700">{item.impact}</p>
                    <div className="mt-5 rounded-xl bg-[#F2F5D9] p-4">
                      <p className="text-xs font-bold uppercase tracking-wider">Recomendação</p>
                      <p className="mt-1 text-sm leading-6">{item.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-neutral-600">Não foram identificados problemas comprovados nas evidências disponíveis.</p>}
            {!!section.limitations.length && (
              <div className="mt-6 border-l-2 border-neutral-300 pl-4 text-sm leading-6 text-neutral-600">
                <strong>Limitações da análise</strong>
                <ul className="mt-1 list-disc pl-5">{section.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul>
              </div>
            )}
          </section>
        ))}
        <section className="rounded-3xl bg-[#111] p-7 text-white sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#DCEA1E]">Próximos passos</p>
          <h2 className="mt-3 text-3xl font-semibold">Um plano de ação para evoluir.</h2>
          <ol className="mt-7 space-y-4">{report.next_steps.map((step,i)=>(
            <li key={i} className="flex items-start gap-4 border-t border-white/15 pt-4">
              <span className="font-semibold text-[#DCEA1E]">{String(i+1).padStart(2,'0')}</span><span className="text-sm leading-7 text-white/85">{step}</span>
            </li>
          ))}</ol>
        </section>
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="text-2xl font-semibold">Vamos transformar análise em estratégia?</h2>
          <p className="mt-3 max-w-3xl text-neutral-700">A Muvens pode apoiar a definição das prioridades e a implementação das melhorias conforme os objetivos do seu negócio.</p>
          <p className="mt-3 text-sm font-semibold">muvensagencia.com.br</p>
        </section>
        <p className="text-xs leading-5 text-neutral-500">Avaliação consultiva com base nas fontes e capturas fornecidas até a data da análise. Dados não acessíveis foram sinalizados. As recomendações não representam garantia de resultados.</p>
      </div>
    </article>
  );
}
