import { classifyPhone, whatsappSignal } from './phone';
import type { Person } from './people';

export interface FilterRow { email?: string | null; phone?: string | null; site_numbers?: string[] | null; linkedin?: string | null; people?: Person[] | null; contacts?: { email: string; kind: string }[] | null; name?: string | null; score?: number | null }
export const CONTACT_FILTERS = [
  { key: 'email', label: 'Com e-mail' },
  { key: 'tel', label: 'Com telefone' },
  { key: 'wa', label: 'Com WhatsApp (provável ou no site)' },
  { key: 'cel', label: 'Telefone celular' },
  { key: 'linkedin', label: 'Com LinkedIn' },
  { key: 'decisor', label: 'Com decisor citado (comercial, compras ou direção)' },
  { key: 'emailcom', label: 'E-mail de comercial, compras ou diretoria' },
] as const;
export type ContactFilter = (typeof CONTACT_FILTERS)[number]['key'];

const has = (r: FilterRow): Record<ContactFilter, boolean> => {
  const w = whatsappSignal(r.phone, r.site_numbers ?? []);
  const hasPhone = !!r.phone && r.phone.replace(/\D/g, '').length >= 8;
  return {
    email: !!r.email, tel: hasPhone, cel: classifyPhone(r.phone).kind === 'celular',
    wa: w.level === 'confirmado' || w.level === 'provavel' || w.level === 'outro',
    linkedin: !!r.linkedin, decisor: (r.people ?? []).length > 0,
    emailcom: (r.contacts ?? []).some((c) => ['comercial', 'compras', 'diretoria'].includes(c.kind)),
  };
};

/** Todos os filtros marcados precisam ser verdadeiros (E). */
export function matchesContact(r: FilterRow, filters: ContactFilter[]): boolean { const h = has(r); return filters.every((f) => h[f]); }

/** Facilidade de abordar: quanto maior, mais canais e pessoas. */
export function reachRank(r: FilterRow): number { const h = has(r); return (h.email ? 3 : 0) + (h.wa ? 3 : h.tel ? 1 : 0) + (h.emailcom ? 2 : 0) + (h.decisor ? 2 : 0) + (h.linkedin ? 1 : 0); }

export function parseFilters(v: string | string[] | undefined): ContactFilter[] {
  const list = (Array.isArray(v) ? v : (v ?? '').split(',')).map((x) => x.trim());
  return CONTACT_FILTERS.map((f) => f.key).filter((k) => list.includes(k));
}

/** Pronto para abordagem: tem e-mail E algum sinal de WhatsApp (celular, ou número publicado no site). */
export function isReady(r: FilterRow): boolean { const h = has(r); return h.email && h.wa; }

/** Número para o WhatsApp: o publicado no site (se houver) ou o telefone cadastrado quando for celular. */
export function whatsappNumber(r: Pick<FilterRow, 'phone' | 'site_numbers'>): string | null {
  const w = whatsappSignal(r.phone, r.site_numbers ?? []);
  if (w.level === 'outro' || w.level === 'confirmado') return (w.level === 'outro' ? r.site_numbers?.[0] : r.phone) ?? null;
  if (w.level === 'provavel') return r.phone ?? null;
  return null;
}

export type Focus = 'sites' | 'recorrentes';
export const FOCUS_LABEL: Record<Focus, string> = { sites: 'Sites e landing pages', recorrentes: 'Serviços recorrentes (redes, tráfego, automação)' };
export const parseFocus = (v: string | undefined): Focus | null => (v === 'sites' || v === 'recorrentes' ? v : null);

type NeedsRow = { needs?: { site?: number; social?: number; ads?: number } | null; recommended_service?: string | null; website?: string | null };
/** Oportunidade de site (sem site, site ruim) ou de serviço recorrente (redes sociais, anúncios). Análises antigas, sem o detalhamento, usam o serviço sugerido. */
export function matchesFocus(r: NeedsRow, focus: Focus | null): boolean {
  if (!focus) return true;
  const n = r.needs;
  if (focus === 'sites') return n ? (n.site ?? 0) >= 12 : ['site_institucional', 'landing_page'].includes(r.recommended_service ?? '');
  return n ? (n.social ?? 0) > 0 || (n.ads ?? 0) > 0 : ['redes_sociais', 'trafego_pago', 'design_recorrente', 'design_posts'].includes(r.recommended_service ?? '');
}
