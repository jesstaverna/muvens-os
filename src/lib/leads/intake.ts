import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeProspect } from '@/lib/prospecting/pipeline';
import { ingestLead, type IngestResult } from './ingest';
import { resendProvider } from '@/integrations/email';
import { sendDiagnosisRequestAlert } from './alert';
import { normalizeLead } from './normalize';

/** Entrada única de leads (webhook e página pública): normaliza, grava no CRM e agenda a análise do site em segundo plano. */
export async function intakeLead(db: SupabaseClient, raw: unknown, appUrl: string): Promise<IngestResult & { error?: string }> {
  const lead = normalizeLead(raw);
  if (!lead) return { ok: false, error: 'lead sem nome e sem contato' };
  const r = await ingestLead(db, lead, appUrl);
  if (r.ok && !r.duplicate && r.leadId && /diagnóstico gratuito/i.test(lead.interest ?? '')) { try { await sendDiagnosisRequestAlert(db, resendProvider(), appUrl, r.leadId, { site: lead.website, instagram: lead.instagram, source: lead.source, campaign: lead.campaign, ad: lead.ad }); } catch { /* o lead já está no CRM */ } }
  if (r.ok && r.needsAnalysis && r.prospectId) { const id = r.prospectId; after(async () => { try { await analyzeProspect(db, id, { site: { withPageSpeed: false } }); } catch { /* o worker tenta de novo */ } }); }
  return r;
}

const SOURCES: [RegExp, string][] = [[/insta|^ig$/i, 'Instagram (link)'], [/face|^fb$|meta/i, 'Facebook (link)'], [/whats|^wa$/i, 'WhatsApp (link)'], [/google|gads|adwords/i, 'Google (link)'], [/email|newsletter/i, 'E-mail (link)']];
/** Rótulo de origem a partir do utm_source do link usado (bio do Instagram, WhatsApp, etc.). */
export function sourceFromUtm(utm: string | null | undefined): string {
  const t = (utm ?? '').trim(); if (!t) return 'Site (diagnóstico gratuito)';
  return SOURCES.find(([re]) => re.test(t))?.[1] ?? `Site (${t.slice(0, 40)})`;
}
