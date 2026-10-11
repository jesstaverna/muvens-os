import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeSite } from '@/integrations/site-analyzer';
import type { SafeFetchOptions } from '@/integrations/net-safe';
import { scoreProspect } from './analysis';
import { draftFirstEmail, WHATSAPP_INTRO } from './message';

export interface AnalyzeOptions { site?: SafeFetchOptions & { withPageSpeed?: boolean } }

/** Analisa um prospecto (site público), calcula a pontuação e prepara os rascunhos de mensagem. Idempotente. */
export async function analyzeProspect(db: SupabaseClient, prospectId: string, opts: AnalyzeOptions = {}): Promise<{ ok: boolean; error?: string }> {
  const { data: p, error } = await db.from('prospects').select('id, name, category, website, phone, email, rating, reviews_count, status, campaign_id, prospect_campaigns(city)').eq('id', prospectId).maybeSingle();
  if (error || !p) return { ok: false, error: error?.message ?? 'Prospecto não encontrado' };
  const site = p.website ? await analyzeSite(p.website, opts.site) : null;
  const scored = scoreProspect({ hasWebsite: !!p.website, site, rating: p.rating == null ? null : Number(p.rating), reviews: p.reviews_count });
  const analysis = {
    site, reasons: scored.reasons, observations: scored.observations,
    visual: { status: 'pendente', note: 'Análise de identidade visual por IA depende da integração com a Claude API (Fase 4); hoje só são verificados favicon e imagem de compartilhamento.' },
    analyzed_with: 'regras-v1',
  };
  const { error: uErr } = await db.from('prospects').update({ analysis, score: scored.score, recommended_service: scored.service, analyzed_at: new Date().toISOString(), analysis_error: null, ...(p.status === 'novo' ? { status: 'analisado' } : {}) }).eq('id', p.id);
  if (uErr) return { ok: false, error: uErr.message };

  const { data: s } = await db.from('outreach_settings').select('sender_name, company_legal_name, company_document, company_address, require_approval').eq('id', 1).maybeSingle();
  const sender = { name: s?.sender_name ?? 'Equipe Muvens', companyLegalName: s?.company_legal_name ?? '', companyDocument: s?.company_document, companyAddress: s?.company_address ?? '' };
  const city = (Array.isArray(p.prospect_campaigns) ? p.prospect_campaigns[0] : p.prospect_campaigns)?.city ?? null;
  const rows: Record<string, unknown>[] = [];
  if (p.email) { const m = draftFirstEmail({ name: p.name, category: p.category, city }, scored, sender); rows.push({ prospect_id: p.id, channel: 'email', step: 1, subject: m.subject, body: m.body, status: 'rascunho' }); }
  if (p.phone) rows.push({ prospect_id: p.id, channel: 'whatsapp_manual', step: 1, body: WHATSAPP_INTRO(p.name, sender.name), status: 'rascunho' });
  if (rows.length) {
    // não sobrescreve texto já editado: só cria o que ainda não existe (índice único parcial impede duplicatas)
    const { data: existing } = await db.from('outreach_messages').select('channel, step').eq('prospect_id', p.id).neq('status', 'cancelada');
    const have = new Set((existing ?? []).map((m) => `${m.channel}:${m.step}`));
    const fresh = rows.filter((r) => !have.has(`${r.channel}:${r.step}`));
    if (fresh.length) { const { error: mErr } = await db.from('outreach_messages').insert(fresh); if (mErr) return { ok: false, error: mErr.message }; }
  }
  return { ok: true };
}

/** Analisa prospectos novos ainda sem análise (usado pelo worker). */
export async function analyzePending(db: SupabaseClient, limit = 10) {
  const { data } = await db.from('prospects').select('id').eq('status', 'novo').is('analyzed_at', null).order('created_at').limit(limit);
  let done = 0, failed = 0;
  for (const r of data ?? []) { const x = await analyzeProspect(db, r.id, { site: { withPageSpeed: true } }); if (x.ok) done++; else { failed++; await db.from('prospects').update({ analysis_error: x.error?.slice(0, 300) }).eq('id', r.id); } }
  return { analyzed: done, failed };
}
