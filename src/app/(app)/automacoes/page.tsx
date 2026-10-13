import { requireModule } from '@/lib/session';
import { PageHeader, Empty, Stat } from '@/components/ui';
import { dateTimeBR } from '@/lib/format';
import { SubmitButton } from '@/components/SubmitButton';
import { runWorkerNow } from './actions';

export const metadata = { title: 'Automações' };

const LABEL: Record<string, string> = { 'lead.created': 'Novo lead → notificar responsável', 'proposal.accepted': 'Proposta aceita → preparar contrato', 'scan.all': 'Varredura periódica (atrasos, leads parados, propostas paradas, recorrências)' };
const TONE: Record<string, string> = { done: 'text-ok', failed: 'text-warn', dead: 'text-danger', running: 'text-fg', pending: 'text-muted' };

const MIGRATIONS: [string, string, string][] = [
  ['m11_prospeccao', 'Prospecção (11)', 'setup.sql ou A/B'], ['m12_link_publico', 'Link público do diagnóstico (12)', 'C_link_publico_diagnostico.sql'], ['m13_precos_visualizacoes', 'Preços e visualizações (13)', 'D ou G'],
  ['m14_pontuacao_landing', 'Pontuação na landing (14)', 'E ou G'], ['m15_novos_servicos', 'Novos serviços (15)', 'F ou G'], ['m16_cadencia', 'Cadência (16)', 'H_cadencia.sql'], ['m17_busca_semanal', 'Busca semanal (17)', 'I_busca_semanal.sql'],
  ['m18_leads_anuncios', 'Leads de anúncios (18)', 'J_leads_anuncios.sql'], ['m19_prospecto_crm', 'Prospecto vai ao CRM (19)', 'K_prospecto_para_crm.sql'], ['m21_resumo_email', 'Resumo semanal por e-mail (21)', 'M_resumo_por_email.sql'], ['m22_alerta_lead_quente', 'Alerta de lead quente (22)', 'N_alerta_lead_quente.sql'],
];
const ENV: [string, string, string][] = [
  ['GOOGLE_PLACES_API_KEY', 'Google Maps (busca de empresas)', 'Obrigatória para a busca de prospectos'], ['RESEND_API_KEY', 'Resend (envio de e-mails)', 'Obrigatória para enviar e-mails'], ['CRON_SECRET', 'Agendador (segredo)', 'Obrigatória para o processamento automático'],
  ['LEADS_WEBHOOK_SECRET', 'Webhook de leads (Zapier)', 'Necessária para receber leads de anúncios'], ['NEXT_PUBLIC_APP_URL', 'Endereço do sistema', 'Usada nos links dos e-mails e das landings'], ['NEXT_PUBLIC_CONTACT_WHATSAPP', 'WhatsApp da landing', 'Opcional: botão de contato do diagnóstico'],
];

export default async function Automacoes() {
  const { supabase, profile } = await requireModule('automacoes');
  const isAdmin = profile.role === 'admin';
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data: health, error: healthErr }, { data: runs }, sent, failed, lastLead, queued] = await Promise.all([
    supabase.rpc('system_health'),
    supabase.from('worker_runs').select('ran_at, ok, result').order('ran_at', { ascending: false }).limit(5),
    supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'enviada').gte('sent_at', since7),
    supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'falhou'),
    supabase.from('leads').select('created_at, source').or('source.ilike.%Ads%,source.ilike.%(link)%,source.ilike.Site%').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'aprovada'),
  ]);
  const lastRun = runs?.[0]; const stale = !lastRun || Date.now() - new Date(lastRun.ran_at).getTime() > 30 * 3600_000;
  const h = (health ?? {}) as Record<string, boolean>;
  const { data: jobs } = await supabase.from('jobs').select('id, type, status, attempts, max_attempts, run_at, finished_at, last_error, created_at').order('created_at', { ascending: false }).limit(100);
  const count = (s: string) => jobs?.filter((j) => j.status === s).length ?? 0;
  const last = jobs?.find((j) => j.type === 'scan.all' && j.status === 'done');
  return (
    <>
      <PageHeader title="Automações" subtitle="Fila de jobs processada no servidor por /api/worker, acionado por um agendador externo — independe do navegador." />
      <section className="card mb-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Saúde do sistema</h2><p className="text-xs text-muted">Confere o banco, as integrações e o agendador. Tudo com ✓ significa que o sistema está pronto para operar.</p></div>
          {isAdmin && <form action={runWorkerNow}><SubmitButton className="btn btn-sm btn-primary" pendingText="Executando… (pode levar 1 min)">Executar processador agora</SubmitButton></form>}</div>
        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <div><h3 className="mb-2 text-sm font-semibold">Banco de dados</h3>
            {healthErr ? <p className="text-sm text-danger">Não foi possível verificar. Rode no Supabase o arquivo <code>supabase/atualizacoes/L_saude_do_sistema.sql</code> (migração 20).</p> : (
              <ul className="space-y-1.5 text-sm">{MIGRATIONS.map(([k, label, file]) => <li key={k} className="flex gap-2"><span className={`font-bold ${h[k] ? 'text-ok' : 'text-danger'}`}>{h[k] ? '✓' : '✗'}</span><span>{label}{!h[k] && <span className="block text-xs text-muted">Falta rodar: {file}</span>}</span></li>)}</ul>)}</div>
          <div><h3 className="mb-2 text-sm font-semibold">Integrações (Vercel)</h3>
            <ul className="space-y-1.5 text-sm">{ENV.map(([k, label, note]) => { const ok = !!process.env[k]; return <li key={k} className="flex gap-2"><span className={`font-bold ${ok ? 'text-ok' : 'text-danger'}`}>{ok ? '✓' : '✗'}</span><span>{label}{!ok && <span className="block text-xs text-muted">{k} não configurada. {note}.</span>}</span></li>; })}</ul></div>
          <div><h3 className="mb-2 text-sm font-semibold">Operação</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex gap-2"><span className={`font-bold ${stale ? 'text-danger' : 'text-ok'}`}>{stale ? '✗' : '✓'}</span><span>Agendador: {lastRun ? `última execução em ${dateTimeBR(lastRun.ran_at)}` : 'nunca executou'}{stale && <span className="block text-xs text-muted">Sem execução nas últimas 30 horas. Confira o CRON_SECRET, o cron da Vercel ou o pg_cron.</span>}</span></li>
              <li className="flex gap-2"><span className="font-bold text-muted">•</span><span>E-mails enviados (7 dias): <b>{sent.count ?? 0}</b> · aprovados na fila: <b>{queued.count ?? 0}</b> · com falha: <b className={failed.count ? 'text-danger' : ''}>{failed.count ?? 0}</b></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted">•</span><span>Último lead de anúncio/link: {lastLead.data ? `${dateTimeBR(lastLead.data.created_at)} (${lastLead.data.source})` : 'nenhum ainda'}</span></li>
            </ul></div>
        </div></section>

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
