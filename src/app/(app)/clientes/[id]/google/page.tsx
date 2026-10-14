import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { LinkButton } from '@/components/LinkButton';
import { CopyButton } from '@/components/ClientButtons';
import { appUrl } from '@/lib/app-url';
import { GROUP_LABEL, METRICS, monthLabel } from '@/lib/gmn/metrics';
import { deleteGmnReport, saveGmnReport } from './actions';

export const metadata = { title: 'Relatórios do Google Meu Negócio' };

export default async function GoogleRelatorios({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireModule('clientes');
  const [{ data: client }, { data: reports, error }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('gmn_reports').select('id, period, metrics, highlights, next_steps, token').eq('client_id', id).order('period', { ascending: false }),
  ]);
  if (!client) notFound();
  const can = ['admin', 'comercial'].includes(profile.role); const base = appUrl();
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (
    <>
      <PageHeader title="Relatórios do Google Meu Negócio" subtitle={client.name} actions={<LinkButton href={`/clientes/${id}`} className="btn">← Cliente</LinkButton>} />
      {error && <p className="mb-5 rounded-xl border border-amber-500/40 px-4 py-3 text-sm text-warn">Não foi possível ler os relatórios. Rode no Supabase o arquivo <code>supabase/atualizacoes/P_relatorio_google.sql</code> (migração 24).</p>}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {!reports?.length ? <Empty title="Nenhum relatório ainda" text="Copie os números do painel do Google do cliente (Desempenho) e cadastre o mês ao lado." /> : reports.map((r) => (
            <section key={r.id} className="card"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold first-letter:uppercase">{monthLabel(r.period)}</h2>
              <div className="flex flex-wrap gap-2"><a className="btn btn-sm btn-primary" href={`/relatorio-google/${r.token}`} target="_blank" rel="noreferrer noopener">Abrir</a><CopyButton text={`${base}/relatorio-google/${r.token}`} label="Copiar link" />
                {can && <form action={deleteGmnReport.bind(null, id, r.id)}><SubmitButton className="btn btn-sm" pendingText="…">Excluir</SubmitButton></form>}</div></div>
              <p className="mt-2 text-sm text-muted">{METRICS.filter((m) => (r.metrics as Record<string, number>)?.[m.key] != null).slice(0, 4).map((m) => `${m.label}: ${(r.metrics as Record<string, number>)[m.key]}`).join(' · ') || 'Sem números informados.'}</p></section>))}
        </div>
        {can ? (
          <form action={saveGmnReport.bind(null, id)} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Novo relatório (ou atualizar um mês)</h2>
            <Field label="Mês"><input name="period" type="month" defaultValue={thisMonth} required className="input" /></Field>
            {Object.entries(GROUP_LABEL).map(([g, label]) => (
              <fieldset key={g}><legend className="label">{label}</legend><div className="grid gap-3 sm:grid-cols-2">{METRICS.filter((m) => m.group === g).map((m) => <label key={m.key} className="block text-xs text-muted">{m.label}<input name={m.key} inputMode="decimal" className="input mt-1" /></label>)}</div></fieldset>))}
            <Field label="Destaques do mês" hint="O que melhorou e o que foi feito, em poucas linhas."><textarea name="highlights" rows={3} maxLength={2000} className="input" /></Field>
            <Field label="Próximos passos"><textarea name="next_steps" rows={3} maxLength={2000} className="input" /></Field>
            <p className="text-xs text-muted">Os números vêm do painel do Google do cliente; nada é puxado automaticamente. Campos em branco não aparecem no relatório.</p>
            <SubmitButton>Salvar relatório</SubmitButton></form>
        ) : <p className="text-sm text-muted">Somente administradores e comercial criam relatórios.</p>}
      </div>
    </>
  );
}
