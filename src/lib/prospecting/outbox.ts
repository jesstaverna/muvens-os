import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailProvider } from '@/integrations/email';
import { bodyToHtml, draftFollowup, emailFooter, type Sender } from './message';

/** Envia e-mails aprovados respeitando TODAS as salvaguardas aplicadas no banco (claim_outreach) e registra o resultado. */
export async function processOutbox(db: SupabaseClient, provider: EmailProvider | null, appUrl: string, batch = 10) {
  if (!provider) return { sent: 0, failed: 0, skipped: 'provedor de e-mail não configurado' };
  const { data: s } = await db.from('outreach_settings').select('*').eq('id', 1).single();
  if (!s) return { sent: 0, failed: 0, skipped: 'sem configurações' };
  const { data: rows, error } = await db.rpc('claim_outreach', { p_limit: batch });
  if (error) throw new Error(error.message);
  const sender: Sender = { name: s.sender_name, companyLegalName: s.company_legal_name, companyDocument: s.company_document, companyAddress: s.company_address };
  let sent = 0, failed = 0;
  for (const m of (rows ?? []) as { id: string; to_email: string; subject: string; body: string; unsub_token: string }[]) {
    const unsub = `${appUrl.replace(/\/$/, '')}/descadastro/${m.unsub_token}`;
    const foot = emailFooter(sender, unsub);
    try {
      const r = await provider.send({ from: `${s.sender_name} <${s.sender_email}>`, to: m.to_email, replyTo: s.reply_to ?? undefined, subject: m.subject, text: m.body + foot.text, html: bodyToHtml(m.body) + foot.html, unsubscribeUrl: unsub });
      await db.rpc('finish_outreach', { p_id: m.id, p_ok: true, p_provider_id: r.id });
      sent++;
    } catch (e) {
      await db.rpc('finish_outreach', { p_id: m.id, p_ok: false, p_error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }
  return { sent, failed };
}

/** Cria o rascunho (ou aprovado, se a aprovação manual estiver desligada) do próximo follow-up. */
export async function createFollowups(db: SupabaseClient) {
  const { data: s } = await db.from('outreach_settings').select('*').eq('id', 1).single();
  if (!s?.sender_name) return { created: 0 };
  const { data: cands } = await db.rpc('followup_candidates');
  let created = 0;
  for (const c of (cands ?? []) as { prospect_id: string; next_step: number }[]) {
    const { data: p } = await db.from('prospects').select('name').eq('id', c.prospect_id).single();
    if (!p) continue;
    const d = draftFollowup({ name: p.name }, { name: s.sender_name, companyLegalName: s.company_legal_name ?? '', companyAddress: s.company_address ?? '' });
    const { error } = await db.from('outreach_messages').insert({ prospect_id: c.prospect_id, channel: 'email', step: c.next_step, subject: d.subject, body: d.body, status: s.require_approval ? 'rascunho' : 'aprovada', approved_at: s.require_approval ? null : new Date().toISOString() });
    if (!error) created++;
  }
  return { created };
}
