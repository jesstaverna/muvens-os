import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailProvider } from '@/integrations/email';
import { isReady } from './filters';
import { bodyToHtml, draftFollowup, draftNurture, emailFooter, NURTURE_AFTER_DAYS, type Sender } from './message';

/** Envia e-mails aprovados respeitando TODAS as salvaguardas aplicadas no banco (claim_outreach) e registra o resultado. */
export async function processOutbox(db: SupabaseClient, provider: EmailProvider | null, appUrl: string, batch = 10) {
  if (!provider) return { sent: 0, failed: 0, skipped: 'provedor de e-mail não configurado' };
  const { data: s } = await db.from('outreach_settings').select('*').eq('id', 1).single();
  if (!s) return { sent: 0, failed: 0, skipped: 'sem configurações' };
  const { data: rows, error } = await db.rpc('claim_outreach', { p_limit: batch });
  if (error) throw new Error(error.message);
  const sender: Sender = { name: s.sender_name, companyLegalName: s.company_legal_name, companyDocument: s.company_document, companyAddress: s.company_address };
  let sent = 0, failed = 0;
  for (const m of (rows ?? []) as { id: string; to_email: string; subject: string; body: string; unsub_token: string; prospect_id: string; step: number }[]) {
    const unsub = `${appUrl.replace(/\/$/, '')}/descadastro/${m.unsub_token}`;
    const foot = emailFooter(sender, unsub);
    let body = m.body;
    if (m.step === 1) {
      const { data: pr } = await db.from('prospects').select('report_token').eq('id', m.prospect_id).not('analyzed_at', 'is', null).maybeSingle();
      if (pr?.report_token) body += `\n\nDiagnóstico completo, com os detalhes da análise: ${appUrl.replace(/\/$/, '')}/diagnostico/${pr.report_token}`;
    }
    try {
      const r = await provider.send({ from: `"${String(s.sender_name).replace(/["\\<>\r\n]/g, '').trim()}" <${String(s.sender_email).trim()}>`, to: m.to_email, replyTo: s.reply_to ?? undefined, subject: m.subject, text: body + foot.text, html: bodyToHtml(body) + foot.html, unsubscribeUrl: unsub });
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
    const { data: p } = await db.from('prospects').select('name, source').eq('id', c.prospect_id).single();
    if (!p || p.source === 'inbound') continue;   // lead de anúncio não recebe follow-up de abordagem fria
    const d = draftFollowup({ name: p.name }, { name: s.sender_name, companyLegalName: s.company_legal_name ?? '', companyAddress: s.company_address ?? '' });
    const { error } = await db.from('outreach_messages').insert({ prospect_id: c.prospect_id, channel: 'email', step: c.next_step, subject: d.subject, body: d.body, status: s.require_approval ? 'rascunho' : 'aprovada', approved_at: s.require_approval ? null : new Date().toISOString() });
    if (!error) created++;
  }
  return { created };
}

/**
 * Aprovação automática (só se ligada em Configurações): aprova o 1º e-mail de quem tem e-mail E WhatsApp e atinge a pontuação mínima.
 * Todas as travas de envio (identificação, janela, limite, bloqueios) continuam valendo em claim_outreach.
 */
export async function autoApproveReady(db: SupabaseClient, opts: { force?: boolean } = {}) {
  const { data: s } = await db.from('outreach_settings').select('auto_approve_ready, auto_approve_min_score').eq('id', 1).single();
  if (!opts.force && !s?.auto_approve_ready) return { approved: 0, skipped: 'aprovação automática desligada' };
  let q = db.from('outreach_messages').select('id, prospect_id, prospects!inner(email, phone, status, score, source, site_numbers:analysis->site->whatsappNumbers)').eq('channel', 'email').eq('step', 1).eq('status', 'rascunho').limit(200);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const min = s?.auto_approve_min_score ?? 0;
  const ids = ((rows ?? []) as unknown as { id: string; prospects: { email: string | null; phone: string | null; status: string; score: number | null; source?: string; site_numbers: string[] | null } | { email: string | null; phone: string | null; status: string; score: number | null; source?: string; site_numbers: string[] | null }[] }[])
    .filter((r) => { const p = Array.isArray(r.prospects) ? r.prospects[0] : r.prospects; return !!p && p.source !== 'inbound' && !['descartado', 'respondeu', 'convertido'].includes(p.status) && (p.score ?? 0) >= min && isReady(p); })
    .map((r) => r.id);
  if (!ids.length) return { approved: 0 };
  const { error: uErr } = await db.from('outreach_messages').update({ status: 'aprovada', approved_at: new Date().toISOString() }).in('id', ids).eq('status', 'rascunho');
  if (uErr) throw new Error(uErr.message);
  return { approved: ids.length };
}

/**
 * Nutrição de leads FRIOS (que responderam à qualificação): cria rascunhos de e-mail espaçados (15, 45 e 90 dias).
 * Nada sai sem aprovação. Para quando o prospecto é descartado/convertido ou o lead já foi ganho/perdido no CRM.
 */
export async function createNurtureDrafts(db: SupabaseClient, now = new Date()) {
  const { data: s } = await db.from('outreach_settings').select('sender_name, company_legal_name, company_document, company_address').eq('id', 1).single();
  if (!s?.sender_name) return { created: 0 };
  const sender: Sender = { name: s.sender_name, companyLegalName: s.company_legal_name ?? '', companyDocument: s.company_document, companyAddress: s.company_address ?? '' };
  const first = new Date(now.getTime() - NURTURE_AFTER_DAYS[2] * 86400_000).toISOString();
  const { data: quals } = await db.from('lead_qualifications').select('token, services, answered_at, prospect_id, lead_id, leads(name, pipeline_stages(kind)), prospects(status, email)').eq('status', 'respondido').eq('fit', 'frio').not('prospect_id', 'is', null).lte('answered_at', first).limit(200);
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  let created = 0;
  for (const q of (quals ?? []) as any[]) {
    const pr = one(q.prospects) as { status: string; email: string | null } | null; const lead = one(q.leads) as { name: string; pipeline_stages: { kind: string } | { kind: string }[] | null } | null;
    const kind = (one(lead?.pipeline_stages) as { kind: string } | null)?.kind;
    if (!pr?.email || !lead || ['descartado', 'convertido'].includes(pr.status) || kind === 'won' || kind === 'lost') continue;
    const { data: msgs } = await db.from('outreach_messages').select('step, status, sent_at').eq('prospect_id', q.prospect_id).eq('channel', 'email').neq('status', 'cancelada');
    const have = new Set((msgs ?? []).map((m) => m.step));
    const age = (now.getTime() - new Date(q.answered_at).getTime()) / 86400_000;
    const next = ([2, 3, 4] as const).find((st) => !have.has(st) && age >= NURTURE_AFTER_DAYS[st]);
    if (!next) continue;
    // só cria o próximo passo quando o anterior já foi enviado ou cancelado (espaçamento real, sem empilhar rascunhos)
    const prev = (msgs ?? []).find((m) => m.step === next - 1);
    if (next > 2 && prev && prev.status !== 'enviada') continue;
    const d = draftNurture(next, { name: lead.name, services: q.services ?? [] }, sender, { qualify: `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/qualificar/${q.token}` });
    const { error } = await db.from('outreach_messages').insert({ prospect_id: q.prospect_id, channel: 'email', step: next, subject: d.subject, body: d.body, status: 'rascunho' });
    if (!error) created++;
  }
  return { created };
}
