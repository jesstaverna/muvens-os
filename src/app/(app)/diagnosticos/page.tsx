import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty, Field } from '@/components/ui';
import { DIAGNOSTIC_AREAS, type DiagnosticArea } from '@/lib/diagnostics';
import { createDiagnostic } from './actions';
import { SubmitButton } from '@/components/SubmitButton';

export const metadata = { title:'Diagnósticos consultivos' };

export default async function DiagnosticsHome() {
  const {supabase} = await requireModule('diagnosticos');
  const {data: reports, error} = await supabase.from('digital_diagnostics')
    .select('id,company_name,status,scopes,created_at,analyzed_at,published_at')
    .order('created_at',{ascending:false}).limit(100);
  return (
    <>
      <PageHeader title="Diagnósticos" subtitle="Analise o que cada empresa precisa, revise a auditoria e compartilhe uma página exclusiva." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="card">
          <h2 className="mb-4 text-lg font-semibold">Novo diagnóstico</h2>
          <form action={createDiagnostic} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Empresa"><input name="company_name" required minLength={2} maxLength={180} className="input" placeholder="Nome da empresa" /></Field>
              <Field label="Nome do contato (opcional)"><input name="contact_name" className="input" maxLength={100} /></Field>
            </div>
            <fieldset>
              <legend className="mb-3 text-sm font-semibold">Quais áreas serão analisadas?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.entries(DIAGNOSTIC_AREAS) as [DiagnosticArea,string][]).map(([key,label]) => (
                  <label key={key} className="rounded-xl border border-line p-3">
                    <span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="scopes" value={key} />{label}</span>
                    <input className="input mt-2" type="url" name={'link_' + key} placeholder="https:// (opcional)" aria-label={'URL de ' + label}/>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Você poderá enviar prints de cada área na próxima tela. Para LinkedIn, Instagram e anúncios, prints são necessários para analisar conteúdo e desempenho não disponíveis publicamente.</p>
            </fieldset>
            <Field label="Contexto e objetivo do cliente (opcional)">
              <textarea name="context" className="input min-h-28" maxLength={6000} placeholder="Objetivos, público, principais dificuldades, serviços desejados, contexto de campanhas..." />
            </Field>
            <SubmitButton className="btn btn-primary" pendingText="Criando…">Criar diagnóstico</SubmitButton>
          </form>
        </section>
        <section className="card">
          <h2 className="mb-4 text-lg font-semibold">Histórico de diagnósticos</h2>
          {error && <p className="text-sm text-danger">Não foi possível carregar. Verifique se a migração foi aplicada.</p>}
          {!reports?.length && !error ? <Empty title="Nenhum diagnóstico" text="Crie a primeira análise para começar."/> : (
            <div className="space-y-2">
              {reports?.map(r=>(
                <Link href={'/diagnosticos/' + r.id} key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 hover:bg-subtle">
                  <div><div className="font-medium">{r.company_name}</div><div className="mt-1 text-xs text-muted">{(r.scopes ?? []).map((k:string)=>DIAGNOSTIC_AREAS[k as DiagnosticArea] ?? k).join(' · ')}</div></div>
                  <span className="badge whitespace-nowrap">{r.status === 'publicado' ? 'Publicado' : r.status === 'analisado' ? 'Revisar' : 'Rascunho'}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
