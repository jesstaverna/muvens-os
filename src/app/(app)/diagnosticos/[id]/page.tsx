import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { CopyButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { DIAGNOSTIC_AREAS, reportSchema, type DiagnosticArea } from '@/lib/diagnostics';
import { appUrl } from '@/lib/app-url';
import { DiagnosticReport } from '@/components/DiagnosticReport';
import { DiagnosticUploader } from '../DiagnosticUploader';
import {
  analyzeDiagnostic, saveDiagnosticReport, publishDiagnostic,
  unpublishDiagnostic, deleteDiagnosticUpload,
} from '../actions';

export const maxDuration = 60;
export const metadata = {title:'Revisar diagnóstico'};
const PRIORITIES = {alta:'Alta',media:'Média',baixa:'Baixa'};

export default async function DiagnosticDetail({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const {supabase} = await requireModule('diagnosticos');
  const [{data:record,error},{data:assets}] = await Promise.all([
    supabase.from('digital_diagnostics').select('*').eq('id',id).maybeSingle(),
    supabase.from('digital_diagnostic_assets').select('*').eq('report_id',id).order('created_at',{ascending:false}),
  ]);
  if (error || !record) notFound();
  const r = record;
  const parsed = reportSchema.safeParse(r.report);
  const report = parsed.success ? parsed.data : null;
  const scopes = r.scopes as DiagnosticArea[];
  const published = r.status === 'publicado' && !!r.report_token;
  const publicUrl = published ? appUrl() + '/relatorio-digital/' + r.report_token : '';

  return (
    <>
      <PageHeader title={r.company_name} subtitle="Diagnóstico consultivo — reúna fontes, analise, revise e publique."
        actions={<Link href="/diagnosticos" className="btn btn-sm">← Diagnósticos</Link>}/>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="badge">{published ? 'Publicado' : r.status === 'analisado' ? 'Em revisão' : 'Rascunho'}</span>
        <span className="text-xs text-muted">{scopes.map(s=>DIAGNOSTIC_AREAS[s]).join(' · ')}</span>
      </div>

      <section className="card mb-6">
        <h2 className="mb-3 text-lg font-semibold">1. Fontes e evidências</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {scopes.map(s=><div key={s} className="rounded-lg border border-line p-3 text-sm">
            <div className="font-semibold">{DIAGNOSTIC_AREAS[s]}</div>
            {r.links?.[s] ? <a href={String(r.links[s])} target="_blank" rel="noreferrer noopener" className="mt-1 block break-all text-xs underline">{String(r.links[s])}</a> :
              <div className="mt-1 text-xs text-muted">Sem URL (você pode usar capturas)</div>}
          </div>)}
        </div>
        {r.context && <div className="mt-4 text-sm"><strong>Contexto:</strong><p className="mt-1 whitespace-pre-wrap text-muted">{r.context}</p></div>}
        <h3 className="mb-3 mt-6 text-sm font-semibold">Enviar prints</h3>
        <DiagnosticUploader id={id} scopes={scopes}/>
        <div className="mt-5 space-y-2">
          {assets?.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
            <div className="min-w-0"><span className="font-medium">{a.file_name}</span>
              <span className="ml-2 text-xs text-muted">{DIAGNOSTIC_AREAS[a.scope as DiagnosticArea] ?? a.scope}</span></div>
            <form action={deleteDiagnosticUpload.bind(null,id,a.id)}>
              <button className="btn btn-sm" type="submit">Remover</button>
            </form>
          </div>)}
          {!assets?.length && <p className="text-xs text-muted">Nenhuma captura enviada ainda.</p>}
        </div>
      </section>

      <section className="card mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Análise com IA</h2>
        <p className="mb-4 text-sm text-muted">A IA considera apenas evidências disponíveis. Links de redes sociais não garantem acesso a posts nem métricas. As conclusões serão um rascunho até você revisar e publicar.</p>
        <form action={analyzeDiagnostic.bind(null,id)}>
          <SubmitButton className="btn btn-primary" pendingText="Analisando evidências…">
            {report ? 'Refazer análise com IA' : 'Gerar análise com IA'}
          </SubmitButton>
        </form>
        {published && <p className="mt-3 text-xs text-muted">Ao refazer a análise, o link publicado será desativado até a próxima publicação.</p>}
      </section>

      {report && <section className="card mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Revisar antes de publicar</h2>
        <p className="mb-6 text-sm text-muted">Edite o título, os pontos, evidências, impactos, recomendações e prioridades. Uma análise personalizada deve ser validada por uma pessoa.</p>
        <form action={saveDiagnosticReport.bind(null,id)} className="space-y-6">
          <Field label="Título do relatório"><input className="input" name="headline" defaultValue={report.headline} required maxLength={190}/></Field>
          <Field label="Resumo executivo"><textarea className="input min-h-36" name="executive_summary" defaultValue={report.executive_summary} required maxLength={3000}/></Field>
          {report.sections.map(section=><div key={section.area} className="space-y-4 border-t border-line pt-6">
            <h3 className="text-base font-semibold">{DIAGNOSTIC_AREAS[section.area]}</h3>
            <Field label="Pontos fortes (uma linha por item)">
              <textarea name={'strengths_' + section.area} defaultValue={section.strengths.join('\n')} className="input min-h-20"/>
            </Field>
            {section.findings.map((finding,index)=>{
              const p = 'f_' + section.area + '_' + index + '_';
              return <fieldset key={index} className="space-y-3 rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-semibold">Ponto {index+1}</legend>
                <Field label="Título"><input name={p+'title'} defaultValue={finding.title} required className="input"/></Field>
                <Field label="Evidência"><textarea name={p+'evidence'} defaultValue={finding.evidence} required className="input min-h-20"/></Field>
                <Field label="Impacto possível"><textarea name={p+'impact'} defaultValue={finding.impact} required className="input min-h-20"/></Field>
                <Field label="Melhoria recomendada"><textarea name={p+'recommendation'} defaultValue={finding.recommendation} required className="input min-h-20"/></Field>
                <Field label="Prioridade"><select name={p+'priority'} defaultValue={finding.priority} className="input">
                  {Object.entries(PRIORITIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}
                </select></Field>
              </fieldset>;
            })}
            <Field label="Limitações da análise (uma por linha)">
              <textarea name={'limitations_' + section.area} defaultValue={section.limitations.join('\n')} className="input min-h-20"/>
            </Field>
          </div>)}
          <Field label="Próximos passos (uma linha por item)">
            <textarea name="next_steps" defaultValue={report.next_steps.join('\n')} required className="input min-h-32"/>
          </Field>
          <SubmitButton className="btn btn-dark" pendingText="Salvando…">Salvar revisão</SubmitButton>
        </form>
      </section>}

      {report && <section className="card mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Página para enviar ao cliente</h2>
        {published ? <>
          <p className="mb-4 text-sm text-muted">Relatório publicado. Use o link ou copie a mensagem pronta para WhatsApp e e-mail.</p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Abrir relatório público</a>
            <CopyButton text={publicUrl} label="Copiar link"/>
          </div>
          <pre className="mt-5 whitespace-pre-wrap rounded-xl border border-line bg-subtle p-4 font-sans text-sm leading-6">{r.message}</pre>
          <CopyButton text={String(r.message ?? '')} label="Copiar mensagem + link"/>
          <form action={unpublishDiagnostic.bind(null,id)} className="mt-5">
            <SubmitButton className="btn" pendingText="Desativando…">Desativar link</SubmitButton>
          </form>
        </> : <>
          <p className="mb-4 text-sm text-muted">Confira a prévia abaixo. Somente depois de publicar a página terá um link público.</p>
          <form action={publishDiagnostic.bind(null,id)}>
            <SubmitButton className="btn btn-primary" pendingText="Publicando…">Publicar relatório</SubmitButton>
          </form>
        </>}
      </section>}

      {report && <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Prévia da página</h2>
        <DiagnosticReport company={r.company_name} report={report} publishedAt={r.published_at}/>
      </section>}
    </>
  );
}
