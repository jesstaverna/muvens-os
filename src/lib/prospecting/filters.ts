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
