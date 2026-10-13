import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeSite } from '@/integrations/site-analyzer';
import type { SafeFetchOptions } from '@/integrations/net-safe';
import { scoreProspect } from './analysis';
import { createInboundDrafts } from '@/lib/leads/ingest';
import { draftFirstEmail, WHATSAPP_INTRO } from './message';
import { runPool } from './pool';
import { pickBestEmail } from './emails';

/** Versão das regras de análise. Ao mudar, as análises antigas aparecem como "desatualizadas" e podem ser refeitas em lote. */
export const ANALYSIS_VERSION = 'regras-v3';

export interface AnalyzeOptions { site?: SafeFetchOptions & { withPageSpeed?: boolean } }

/** Analisa um prospecto (site público), calcula a pontuação e prepara os rascunhos de mensagem. Idempotente. */
export async function analyzeProspect(db: SupabaseClient, prospectId: string, opts: AnalyzeOptions = {}): Promise<{ ok: boolean; error?: string }> {
  const { data: p, error } = await db.from('prospects').select('id, name, category, source, website, phone, email, rating, reviews_count, status, campaign_id, prospect_campaigns(city)').eq('id', prospectId).maybeSingle();
  if (error || !p) return { ok: false, error: error?.message ?? 'Prospecto não encontrado' };
  const site = p.website ? await analyzeSite(p.website, opts.site) : null;
  // sem e-mail cadastrado: usa um e-mail comercial público encontrado no próprio site da empresa
  let email: string | null = p.email; let emailSource: string | undefined;
  if (!email && site?.emails?.length) {
    const best = pickBestEmail(site.emails, p.website ? new URL(/^https?:/i.test(p.website) ? p.website : `https://${p.website}`).hostname : null);
    if (best) { const { error: eErr } = await db.from('prospects').update({ email: best }).eq('id', p.id); if (!eErr) { email = best; emailSource = 'site'; } }
  }
  const scored = scoreProspect({ hasWebsite: !!p.website, site, rating: p.rating == null ? null : Number(p.rating), reviews: p.reviews_count, contact: { email, phone: p.phone } });
  const analysis = {
    site, reasons: [...scored.reasons, ...scored.contactReasons], need_score: scored.need, needs: scored.buckets, contact_bonus: scored.contactBonus, observations: scored.observations,
    visual: { status: 'pendente', note: 'Análise de identidade visual por IA depende da integração com a Claude API (Fase 4); hoje só são verificados favicon e imagem de compartilhamento.' },
    analyzed_with: ANALYSIS_VERSION,
    ...(emailSource ? { email_source: emailSource } : {}),
  };
  const { error: uErr } = await db.from('prospects').update({ analysis, score: scored.score, recommended_service: scored.service, analyzed_at: new Date().toISOString(), analysis_error: null, ...(p.status === 'novo' ? { status: 'analisado' } : {}) }).eq('id', p.id);
  if (uErr) return { ok: false, error: uErr.message };

  const { data: s } = await db.from('outreach_settings').select('sender_name, company_legal_name, company_document, company_address, require_approval').eq('id', 1).maybeSingle();
  const sender = { name: s?.sender_name ?? 'Equipe Muvens', companyLegalName: s?.company_legal_name ?? '', companyDocument: s?.company_document, companyAddress: s?.company_address ?? '' };
  const city = (Array.isArray(p.prospect_campaigns) ? p.prospect_campaigns[0] : p.prospect_campaigns)?.city ?? null;
  if (p.source === 'inbound') { await createInboundDrafts(db, p.id, process.env.NEXT_PUBLIC_APP_URL ?? ''); return { ok: true }; }   // lead de anúncio: relacionamento, não abordagem fria
  const rows: Record<string, unknown>[] = [];
  if (email) { const m = draftFirstEmail({ name: p.name, category: p.category, city }, scored, sender); rows.push({ prospect_id: p.id, channel: 'email', step: 1, subject: m.subject, body: m.body, status: 'rascunho' }); }
  if (p.phone || site?.whatsappNumbers?.length) rows.push({ prospect_id: p.id, channel: 'whatsapp_manual', step: 1, body: WHATSAPP_INTRO(p.name, sender.name), status: 'rascunho' });
  if (rows.length) {
    // não sobrescreve texto já editado: só cria o que ainda não existe (índice único parcial impede duplicatas)
    const { data: existing } = await db.from('outreach_messages').select('channel, step').eq('prospect_id', p.id).neq('status', 'cancelada');
    const have = new Set((existing ?? []).map((m) => `${m.channel}:${m.step}`));
    const fresh = rows.filter((r) => !have.has(`${r.channel}:${r.step}`));
    if (fresh.length) { const { error: mErr } = await db.from('outreach_messages').insert(fresh); if (mErr) return { ok: false, error: mErr.message }; }
  }
  return { ok: true };
}

/** Analisa vários prospectos em paralelo limitado, parando de iniciar novos após o prazo. */
export async function analyzeMany(db: SupabaseClient, ids: string[], opts: { concurrency?: number; deadlineMs?: number; site?: AnalyzeOptions['site'] } = {}) {
  const { results, skipped } = await runPool(ids, opts.concurrency ?? 5, async (id) => {
    const r = await analyzeProspect(db, id, { site: opts.site });
    // falha definitiva: marca como tentada para a fila automática não repetir para sempre
    if (!r.ok) await db.from('prospects').update({ analysis_error: r.error?.slice(0, 300), analyzed_at: new Date().toISOString() }).eq('id', id);
    return r.ok;
  }, opts.deadlineMs ?? Infinity);
  return { analyzed: results.filter(Boolean).length, failed: results.filter((x) => !x).length, skipped: skipped.length };
}

/** Pega os próximos `n` prospectos novos sem análise (opcionalmente só de certas campanhas; `null` = prospectos manuais) e analisa. */
export async function analyzeNextBatch(db: SupabaseClient, scope: { campaignIds?: string[]; manualOnly?: boolean } = {}, n = 4) {
  const pending = () => { let q = db.from('prospects').select('id', { count: 'exact' }).eq('status', 'novo').is('analyzed_at', null); if (scope.manualOnly) q = q.is('campaign_id', null); else if (scope.campaignIds) q = q.in('campaign_id', scope.campaignIds); return q; };
  const { data } = await pending().order('created_at').limit(n);
  const ids = (data ?? []).map((r) => r.id);
  const r = ids.length ? await analyzeMany(db, ids, { concurrency: n }) : { analyzed: 0, failed: 0, skipped: 0 };
  const { count } = await pending().limit(1);
  return { processed: ids.length, analyzed: r.analyzed, failed: r.failed, remaining: count ?? 0 };
}

/** Analisa prospectos novos ainda sem análise (usado pelo worker). */
export async function analyzePending(db: SupabaseClient, limit = 10) {
  const { data } = await db.from('prospects').select('id').eq('status', 'novo').is('analyzed_at', null).order('created_at').limit(limit);
  const r = await analyzeMany(db, (data ?? []).map((x) => x.id), { concurrency: 4, site: { withPageSpeed: true } });
  return { analyzed: r.analyzed, failed: r.failed };
}

type Scope = { campaignIds?: string[]; manualOnly?: boolean };
const staleFilter = (db: SupabaseClient, scope: Scope, select = 'id', count = false) => {
  let q = db.from('prospects').select(select, count ? { count: 'exact' } : undefined)
    .not('analyzed_at', 'is', null).is('analysis_error', null).not('status', 'in', '(descartado,respondeu,convertido)')
    .or(`analysis->>analyzed_with.is.null,analysis->>analyzed_with.neq.${ANALYSIS_VERSION}`);
  if (scope.manualOnly) q = q.is('campaign_id', null); else if (scope.campaignIds) q = q.in('campaign_id', scope.campaignIds);
  return q;
};
export async function countStale(db: SupabaseClient, scope: Scope = {}) { const { count } = await staleFilter(db, scope, 'id', true).limit(1); return count ?? 0; }

/** Refaz a análise de prospectos analisados com regras antigas (mantém status, rascunhos e histórico). */
export async function reanalyzeNextBatch(db: SupabaseClient, scope: Scope = {}, n = 3) {
  const { data } = await staleFilter(db, scope).order('analyzed_at').limit(n);
  const ids = ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
  const r = ids.length ? await analyzeMany(db, ids, { concurrency: n }) : { analyzed: 0, failed: 0, skipped: 0 };
  return { processed: ids.length, analyzed: r.analyzed, failed: r.failed, remaining: await countStale(db, scope) };
}
