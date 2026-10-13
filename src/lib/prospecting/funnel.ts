import type { SupabaseClient } from '@supabase/supabase-js';

export type Origin = 'todos' | 'prospeccao' | 'anuncios';
export interface FunnelStage { key: string; label: string; count: number; pctOfFirst: number; convFromPrev: number | null }
export interface Funnel { stages: FunnelStage[]; landingOpened: number; wonValue: number; openValue: number; hotWithoutProposal: number; proposalsStale: number; total: number }

interface P { id: string; status: string; source: string; lead_id: string | null; analyzed_at: string | null; report_first_viewed_at: string | null }
interface L { id: string; kind: string | null; position: number | null; potential_value: number | null }
interface Pr { lead_id: string | null; status: string; total_value: number | null; sent_at: string | null; updated_at: string | null }
interface Q { lead_id: string; fit: string | null; status: string }

/** Funil comercial: da empresa encontrada à proposta fechada, para as empresas criadas no período. Contagens reais; cada etapa é um subconjunto da anterior onde faz sentido. */
export function buildFunnel(prospects: P[], leads: L[], proposals: Pr[], quals: Q[], now = new Date()): Funnel {
  const lead = new Map(leads.map((l) => [l.id, l])); const props = new Map<string, Pr[]>(); for (const p of proposals) if (p.lead_id) props.set(p.lead_id, [...(props.get(p.lead_id) ?? []), p]);
  const qual = new Map(quals.map((q) => [q.lead_id, q]));
  const sentLike = (p: Pr) => p.status !== 'rascunho';
  const withLead = prospects.filter((p) => p.lead_id && lead.has(p.lead_id));
  const contacted = prospects.filter((p) => ['contatado', 'respondeu', 'convertido'].includes(p.status) || (p.lead_id && p.source !== 'inbound'));
  const qualified = withLead.filter((p) => { const q = qual.get(p.lead_id!); const l = lead.get(p.lead_id!)!; return (q?.status === 'respondido' && q.fit !== 'frio') || (l.position ?? 0) >= 3; });
  const proposed = withLead.filter((p) => (props.get(p.lead_id!) ?? []).some(sentLike));
  const won = withLead.filter((p) => lead.get(p.lead_id!)!.kind === 'won' || (props.get(p.lead_id!) ?? []).some((x) => x.status === 'aceita'));
  const counts: [string, string, number][] = [
    ['encontradas', 'Empresas e contatos', prospects.length], ['analisadas', 'Analisadas', prospects.filter((p) => p.analyzed_at).length], ['contatadas', '1º contato feito', contacted.length],
    ['leads', 'Leads no CRM', withLead.length], ['qualificados', 'Qualificados (quente/morno)', qualified.length],
    ['propostas', 'Proposta enviada', proposed.length], ['fechadas', 'Fechadas', won.length],
  ];
  const first = counts[0][2] || 1;
  const stages = counts.map(([key, label, count], i) => ({ key, label, count, pctOfFirst: Math.round((count / first) * 100), convFromPrev: i === 0 || counts[i - 1][2] === 0 || count > counts[i - 1][2] ? null : Math.round((count / counts[i - 1][2]) * 100) }));   // só mostra a conversão quando a etapa é parte da anterior
  const wonIds = new Set(won.map((p) => p.lead_id!));
  const wonValue = [...wonIds].reduce((sum, id) => sum + (props.get(id) ?? []).filter((x) => x.status === 'aceita').reduce((a, x) => a + Number(x.total_value ?? 0), 0), 0);
  const openValue = proposed.filter((p) => !wonIds.has(p.lead_id!)).reduce((sum, p) => sum + (props.get(p.lead_id!) ?? []).filter((x) => ['enviada', 'visualizada', 'em_negociacao'].includes(x.status)).reduce((a, x) => a + Number(x.total_value ?? 0), 0), 0);
  const hotWithoutProposal = withLead.filter((p) => qual.get(p.lead_id!)?.fit === 'quente' && !(props.get(p.lead_id!) ?? []).some(sentLike)).length;
  const proposalsStale = proposals.filter((x) => ['enviada', 'visualizada'].includes(x.status) && x.sent_at && (now.getTime() - new Date(x.sent_at).getTime()) / 86400_000 >= 7).length;
  return { stages, landingOpened: prospects.filter((p) => p.report_first_viewed_at).length, wonValue, openValue, hotWithoutProposal, proposalsStale, total: prospects.length };
}

export async function loadFunnel(db: SupabaseClient, sinceISO: string | null, origin: Origin): Promise<Funnel> {
  let q = db.from('prospects').select('id, status, source, lead_id, analyzed_at, report_first_viewed_at').limit(5000);
  if (sinceISO) q = q.gte('created_at', sinceISO);
  if (origin === 'anuncios') q = q.eq('source', 'inbound'); else if (origin === 'prospeccao') q = q.neq('source', 'inbound');
  const { data: ps } = await q; const prospects = (ps ?? []) as P[];
  const leadIds = [...new Set(prospects.map((p) => p.lead_id).filter(Boolean))] as string[];
  const chunk = <T,>(a: T[], n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const leads: L[] = [], proposals: Pr[] = [], quals: Q[] = [];
  for (const ids of chunk(leadIds)) {
    const [l, p, qq] = await Promise.all([
      db.from('leads').select('id, potential_value, pipeline_stages(kind, position)').in('id', ids),
      db.from('proposals').select('lead_id, status, total_value, sent_at, updated_at').in('lead_id', ids),
      db.from('lead_qualifications').select('lead_id, fit, status').in('lead_id', ids),
    ]);
    for (const r of (l.data ?? []) as any[]) { const st = Array.isArray(r.pipeline_stages) ? r.pipeline_stages[0] : r.pipeline_stages; leads.push({ id: r.id, kind: st?.kind ?? null, position: st?.position ?? null, potential_value: r.potential_value }); }
    proposals.push(...((p.data ?? []) as Pr[])); quals.push(...((qq.data ?? []) as Q[]));
  }
  return buildFunnel(prospects, leads, proposals, quals);
}
