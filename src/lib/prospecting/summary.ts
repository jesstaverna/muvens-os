import type { SupabaseClient } from '@supabase/supabase-js';
import { isReady } from './filters';

export interface Period { since: string; until: string }
export interface Summary {
  novas: number; analisadas: number; prontas: number; emailsEnviados: number; falhas: number; whatsappFeitos: number;
  landingAbertas: number; respostas: number; leadsProspeccao: number; leadsAnuncios: number; qualificacoes: number; quentes: number; mornos: number; frios: number;
}

const cnt = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

/** Números da prospecção e dos leads em um período [since, until). Consultas simples e contagens; sem estimativas. */
export async function summarize(db: SupabaseClient, p: Period): Promise<Summary> {
  const head = (t: string) => db.from(t).select('id', { count: 'exact', head: true });
  const [novas, analisadas, emailsEnviados, falhas, whatsappFeitos, landingAbertas, respostas, leadsProspeccao, leadsAnuncios, quals] = await Promise.all([
    cnt(head('prospects').gte('created_at', p.since).lt('created_at', p.until)),
    cnt(head('prospects').gte('analyzed_at', p.since).lt('analyzed_at', p.until)),
    cnt(head('outreach_messages').eq('channel', 'email').eq('status', 'enviada').gte('sent_at', p.since).lt('sent_at', p.until)),
    cnt(head('outreach_messages').eq('channel', 'email').eq('status', 'falhou').gte('created_at', p.since).lt('created_at', p.until)),
    cnt(head('outreach_messages').eq('channel', 'whatsapp_manual').eq('status', 'enviada').gte('sent_at', p.since).lt('sent_at', p.until)),
    cnt(head('prospects').gte('report_first_viewed_at', p.since).lt('report_first_viewed_at', p.until)),
    cnt(head('prospects').eq('status', 'respondeu').gte('updated_at', p.since).lt('updated_at', p.until)),
    cnt(head('leads').like('source', 'Prospecção%').gte('created_at', p.since).lt('created_at', p.until)),
    cnt(head('leads').or('source.ilike.%Ads%,source.ilike.%(link)%,source.ilike.Site%').gte('created_at', p.since).lt('created_at', p.until)),
    db.from('lead_qualifications').select('fit').eq('status', 'respondido').gte('answered_at', p.since).lt('answered_at', p.until).limit(1000),
  ]);
  const { data: rows } = await db.from('prospects').select('email, phone, site_numbers:analysis->site->whatsappNumbers').gte('created_at', p.since).lt('created_at', p.until).limit(2000);
  const fits = (quals.data ?? []) as { fit: string }[];
  return { novas, analisadas, prontas: (rows ?? []).filter((r: any) => isReady(r)).length, emailsEnviados, falhas, whatsappFeitos, landingAbertas, respostas, leadsProspeccao, leadsAnuncios,
    qualificacoes: fits.length, quentes: fits.filter((f) => f.fit === 'quente').length, mornos: fits.filter((f) => f.fit === 'morno').length, frios: fits.filter((f) => f.fit === 'frio').length };
}

/** Período atual (últimos N dias) e o período anterior, de mesmo tamanho, para comparação. */
export function periods(days: number, now = new Date()): { cur: Period; prev: Period } {
  const end = now.toISOString(); const mid = new Date(now.getTime() - days * 86400_000).toISOString(); const start = new Date(now.getTime() - 2 * days * 86400_000).toISOString();
  return { cur: { since: mid, until: end }, prev: { since: start, until: mid } };
}
export const pct = (cur: number, prev: number): number | null => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 100));
