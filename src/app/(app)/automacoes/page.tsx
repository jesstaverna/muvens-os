import { requireModule } from '@/lib/session';
import { PageHeader, Empty, Stat } from '@/components/ui';
import { dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Automações' };

const LABEL: Record<string, string> = { 'lead.created': 'Novo lead → notificar responsável', 'proposal.accepted': 'Proposta aceita → preparar contrato', 'scan.all': 'Varredura periódica (atrasos, leads parados, propostas paradas, recorrências)' };
const TONE: Record<string, string> = { done: 'text-ok', failed: 'text-warn', dead: 'text-danger', running: 'text-fg', pending: 'text-muted' };

export default async function Automacoes() {
  const { supabase } = await requireModule('automacoes');
  const { data: jobs } = await supabase.from('jobs').select('id, type, status, attempts, max_attempts, run_at, finished_at, last_error, created_at').order('created_at', { ascending: false }).limit(100);
  const count = (s: string) => jobs?.filter((j) => j.status === s).length ?? 0;
  const last = jobs?.find((j) => j.type === 'scan.all' && j.status === 'done');
  return (
    <>
      <PageHeader title="Automações" subtitle="Fila de jobs processada no servidor por /api/worker, acionado por um agendador externo — independe do navegador." />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pendentes" value={count('pending') + count('running')} />
        <Stat label="Com falha (retentativa)" value={count('failed')} tone={count('failed') ? 'danger' : undefined} />
        <Stat label="Esgotadas (dead)" value={count('dead')} tone={count('dead') ? 'danger' : undefined} hint="Exigem intervenção" />
        <Stat label="Última varredura" value={<span className="text-base">{last ? dateTimeBR(last.finished_at) : 'Nunca'}</span>} hint={last ? undefined : 'Agendador ainda não configurado'} />
      </div>
      {!jobs?.length ? <Empty title="Nenhum job registrado" text="Configure o agendador (ver docs/DEPLOY.md) para chamar /api/worker a cada 5 minutos." /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full"><thead><tr className="border-b border-line"><th className="th">Automação</th><th className="th">Status</th><th className="th">Tentativas</th><th className="th">Execução</th><th className="th">Erro</th></tr></thead>
            <tbody>{jobs.map((j) => (
              <tr key={j.id} className="border-b border-line last:border-0">
                <td className="td">{LABEL[j.type] ?? j.type}</td>
                <td className={`td font-medium ${TONE[j.status]}`}>{j.status}</td>
                <td className="td">{j.attempts}/{j.max_attempts}</td>
                <td className="td whitespace-nowrap">{dateTimeBR(j.finished_at ?? j.run_at)}</td>
                <td className="td max-w-xs truncate text-muted" title={j.last_error ?? ''}>{j.last_error ?? '—'}</td>
              </tr>))}</tbody></table>
        </div>
      )}
    </>
  );
}
