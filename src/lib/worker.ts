import type { SupabaseClient } from '@supabase/supabase-js';
import { resendProvider, type EmailProvider } from '@/integrations/email';
import { analyzePending } from '@/lib/prospecting/pipeline';
import { runRecurringCampaigns } from '@/lib/prospecting/recurring';
import { autoApproveReady, createFollowups, processOutbox } from '@/lib/prospecting/outbox';

interface Job { id: string; type: string; payload: Record<string, unknown>; attempts: number }

type Handler = (db: SupabaseClient, job: Job) => Promise<void>;

/**
 * Handlers por tipo de job. Cada handler deve ser idempotente (o job pode ser reexecutado após falha).
 * Integrações externas (RD Station, Clicksign, Asaas...) entram aqui na Fase 3 — NÃO há chamadas externas ainda.
 */
export const handlers: Record<string, Handler> = {
  // Notificação já criada pelo banco; aqui entraria o aviso por e-mail/WhatsApp ao responsável (Fase 3).
  'lead.created': async (db, job) => {
    const leadId = String(job.payload.lead_id ?? '');
    const { data: lead, error } = await db.from('leads').select('id, name, owner_id, potential_value').eq('id', leadId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) return; // lead removido
    const { error: nErr } = await db.from('notifications').upsert({
      title: 'Novo lead', body: `${lead.name} entrou no funil.`, link: `/crm/${lead.id}`, severity: 'info',
      user_id: lead.owner_id, audience: lead.owner_id ? null : 'comercial', dedupe_key: `lead.created:${lead.id}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (nErr) throw new Error(nErr.message);
  },
  // O banco já criou cliente + notificação. O contrato (Fase 2) será gerado aqui, sempre como rascunho para revisão humana.
  'proposal.accepted': async () => {}, // o rascunho do contrato é criado pelo banco (trigger) no momento do aceite
  // Onboarding/projeto inicial entram com o módulo de Projetos (Fase 2, próxima etapa). O banco já ativou cliente e financeiro.
  'contract.signed': async () => {},
  'scan.all': async (db) => {
    const { error } = await db.rpc('run_scheduled_scans');
    if (error) throw new Error(error.message);
    const { error: cErr } = await db.rpc('run_contract_scans');
    if (cErr) throw new Error(cErr.message);
    const { error: pErr } = await db.rpc('run_project_scans');
    if (pErr) throw new Error(pErr.message);
    const { error: qErr } = await db.rpc('run_prospect_scans');
    if (qErr) throw new Error(qErr.message);
  },
};

export async function runWorker(db: SupabaseClient, batch = 20, email: EmailProvider | null = resendProvider()) {
  // Garante uma varredura por hora (idempotente via dedupe_key)
  const hour = new Date().toISOString().slice(0, 13);
  const key = `scan.all:${hour}`;
  const { data: existing } = await db.from('jobs').select('id').eq('dedupe_key', key).limit(1);
  if (!existing?.length) await db.from('jobs').insert({ type: 'scan.all', dedupe_key: key }); // corrida entre workers: o índice único barra o duplicado

  const { data: jobs, error } = await db.rpc('claim_jobs', { p_limit: batch });
  if (error) throw new Error(error.message);

  let done = 0, failed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Sem handler para o job "${job.type}"`);
      await handler(db, job);
      await db.rpc('finish_job', { p_id: job.id });
      done++;
    } catch (e) {
      await db.rpc('finish_job', { p_id: job.id, p_error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }
  // Prospecção: análise de novos prospectos, follow-ups e envio de e-mails (salvaguardas aplicadas no banco)
  const prospecting: Record<string, unknown> = {};
  for (const [name, fn] of [['recurring', () => runRecurringCampaigns(db)], ['analysis', () => analyzePending(db)], ['autoApprove', () => autoApproveReady(db)], ['followups', () => createFollowups(db)], ['outbox', () => processOutbox(db, email, process.env.NEXT_PUBLIC_APP_URL ?? '')]] as const) {
    try { prospecting[name] = await fn(); } catch (e) { prospecting[name] = { error: e instanceof Error ? e.message : String(e) }; }
  }
  return { claimed: jobs?.length ?? 0, done, failed, prospecting };
}
