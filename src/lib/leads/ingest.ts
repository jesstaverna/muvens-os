import type { SupabaseClient } from '@supabase/supabase-js';
import { draftInboundEmail, WHATSAPP_INBOUND } from '@/lib/prospecting/message';
import { type Answers, scoreAnswers } from './qualify';
import type { InboundLead } from './normalize';

const noteOf = (l: InboundLead) => [`Origem: ${l.source}`, l.campaign && `Campanha: ${l.campaign}`, l.ad && `Anúncio: ${l.ad}`, l.website && `Site: ${l.website}`, l.instagram && `Instagram: ${l.instagram}`, l.message && `Mensagem: ${l.message}`, ...Object.entries(l.extra).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)].filter(Boolean).join('\n');

/** Cria rascunhos de relacionamento (e-mail + WhatsApp assistido) para um prospecto de anúncio. Nada é enviado: o e-mail espera aprovação. */
export async function createInboundDrafts(db: SupabaseClient, prospectId: string, appUrl: string) {
  const { data: p } = await db.from('prospects').select('id, name, email, phone, status').eq('id', prospectId).maybeSingle();
  const { data: q } = await db.from('lead_qualifications').select('token, lead_id').eq('prospect_id', prospectId).maybeSingle();
  if (!p || !q) return 0;
  const { data: lead } = await db.from('leads').select('name, company').eq('id', q.lead_id).maybeSingle();
  const { data: s } = await db.from('outreach_settings').select('sender_name, company_legal_name, company_document, company_address').eq('id', 1).maybeSingle();
  const sender = { name: s?.sender_name ?? 'Equipe Muvens', companyLegalName: s?.company_legal_name ?? '', companyDocument: s?.company_document, companyAddress: s?.company_address ?? '' };
  const url = `${appUrl.replace(/\/$/, '')}/qualificar/${q.token}`; const who = { name: lead?.name ?? p.name, company: lead?.company };
  const rows: Record<string, unknown>[] = [];
  if (p.email) { const m = draftInboundEmail(who, sender, url); rows.push({ prospect_id: p.id, channel: 'email', step: 1, subject: m.subject, body: m.body, status: 'rascunho' }); }
  if (p.phone) rows.push({ prospect_id: p.id, channel: 'whatsapp_manual', step: 1, body: WHATSAPP_INBOUND(who.name, sender.name, url), status: 'rascunho' });
  if (!rows.length) return 0;
  const { data: existing } = await db.from('outreach_messages').select('channel, step').eq('prospect_id', p.id).neq('status', 'cancelada');
  const have = new Set((existing ?? []).map((m) => `${m.channel}:${m.step}`));
  const fresh = rows.filter((r) => !have.has(`${r.channel}:${r.step}`));
  if (fresh.length) await db.from('outreach_messages').insert(fresh);
  return fresh.length;
}

export interface IngestResult { ok: boolean; duplicate?: boolean; leadId?: string; prospectId?: string | null; needsAnalysis?: boolean; error?: string }

/** Lead de anúncio/formulário → CRM (+ prospecto para análise do site, qualificação e rascunhos). Duplicado por e-mail/telefone só registra a nova interação. */
export async function ingestLead(db: SupabaseClient, l: InboundLead, appUrl: string): Promise<IngestResult> {
  const { data: stage } = await db.from('pipeline_stages').select('id').eq('active', true).order('position').limit(1).single();
  if (!stage) return { ok: false, error: 'Funil sem etapas ativas' };
  const { data: lead, error } = await db.from('leads').insert({ name: l.name, company: l.company, email: l.email, phone: l.phone, whatsapp: l.phone, source: l.source, stage_id: stage.id, notes: noteOf(l), next_action: 'Revisar rascunho de contato e qualificar o lead' }).select('id').single();
  if (error) {
    if (error.code !== '23505') return { ok: false, error: error.message };
    let q = db.from('leads').select('id').limit(1);
    q = l.email ? q.eq('email_norm', l.email.toLowerCase()) : q.eq('phone', l.phone ?? '');
    const { data: ex } = await q.maybeSingle();
    if (ex) await db.from('lead_interactions').insert({ lead_id: ex.id, kind: 'sistema', content: `Novo contato via ${l.source}.\n${noteOf(l)}` });
    return { ok: true, duplicate: true, leadId: ex?.id };
  }
  await db.from('lead_interactions').insert({ lead_id: lead!.id, kind: 'sistema', content: `Lead recebido via ${l.source}.\n${noteOf(l)}` });
  const { data: pr, error: pErr } = await db.from('prospects').insert({ name: l.company ?? l.name, website: l.website, email: l.email, phone: l.phone, source: 'inbound', lead_id: lead!.id, status: 'novo' }).select('id').single();
  let prospectId: string | null = pr?.id ?? null;
  if (pErr) { prospectId = null; await db.from('lead_interactions').insert({ lead_id: lead!.id, kind: 'sistema', content: 'Não foi criado o prospecto para análise (e-mail ou site já cadastrado na Prospecção).' }); }
  await db.from('lead_qualifications').insert({ lead_id: lead!.id, prospect_id: prospectId });
  let needsAnalysis = false;
  if (prospectId) { if (l.website) needsAnalysis = true; else await createInboundDrafts(db, prospectId, appUrl); }
  return { ok: true, leadId: lead!.id, prospectId, needsAnalysis };
}

/** Grava as respostas do formulário de qualificação, pontua e avisa a equipe. Usa o token público (uma resposta por lead). */
export async function submitQualification(db: SupabaseClient, token: string, answers: Answers): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  const { data: q } = await db.from('lead_qualifications').select('id, lead_id, status').eq('token', token).maybeSingle();
  if (!q) return { ok: false, error: 'Link inválido' };
  if (q.status === 'respondido') return { ok: true, already: true };
  const sc = scoreAnswers(answers);
  const { error } = await db.from('lead_qualifications').update({ status: 'respondido', answers, score: sc.score, fit: sc.fit, services: sc.services, answered_at: new Date().toISOString() }).eq('id', q.id).eq('status', 'pendente');
  if (error) return { ok: false, error: error.message };
  const first = sc.services[0];
  await db.from('leads').update({ next_action: sc.fit === 'frio' ? 'Nutrir com conteúdo (lead frio)' : 'Revisar respostas e enviar proposta', ...(first ? { service_interest: first } : {}), last_contact_at: new Date().toISOString() }).eq('id', q.lead_id);
  await db.from('lead_interactions').insert({ lead_id: q.lead_id, kind: 'sistema', content: `Qualificação respondida: ${sc.fit.toUpperCase()} (${sc.score}/100).\nDificuldade: ${answers.dificuldade}\nPrecisa: ${answers.precisa}\n${sc.reasons.join(' · ')}` });
  const { data: lead } = await db.from('leads').select('name, owner_id').eq('id', q.lead_id).maybeSingle();
  await db.from('notifications').insert({ title: `Lead ${sc.fit}: ${lead?.name ?? 'novo lead'} respondeu a qualificação`, body: `Pontuação ${sc.score}/100. ${answers.dificuldade.slice(0, 160)}`, link: `/crm/${q.lead_id}`, severity: sc.fit === 'quente' ? 'warning' : 'info', audience: 'comercial', user_id: lead?.owner_id ?? null, dedupe_key: `qualif:${q.id}` });
  return { ok: true };
}
