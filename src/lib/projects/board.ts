// Regras puras do quadro do cliente (colunas, atrasos, linha do tempo). Testadas em board.test.ts.
export const AREAS: Record<string, string> = { diagramacao: 'Diagramação', social_media: 'Social Media', outro: 'Outras demandas' };

export interface BoardTask {
  id: string; title: string; status: string; area: string | null; starts_on: string | null; due_on: string | null; review_due_on: string | null; changes_due_on: string | null;
  client_wait_days?: number; priority?: string; origin?: string; project_id: string; project: string; assignee: string | null; assignees?: string[]; service_id?: string | null; service?: string | null; links: number; comments: number;
}

export const COLUMNS = [
  { key: 'diagramacao', label: 'Diagramação' }, { key: 'social_media', label: 'Social Media' }, { key: 'outro', label: 'Outras demandas' },
  { key: 'andamento', label: 'Em andamento' }, { key: 'aprovacao', label: 'Aprovação' }, { key: 'ajustes', label: 'Solicitação de ajustes' },
  { key: 'aprovados', label: 'Aprovados' }, { key: 'finalizados', label: 'Finalizados' },
] as const;
export type ColumnKey = (typeof COLUMNS)[number]['key'];

/** Em qual coluna do quadro o cartão aparece. Demandas que ainda não começaram ficam na coluna da sua área. */
export function columnOf(t: Pick<BoardTask, 'status' | 'area'>): ColumnKey {
  switch (t.status) {
    case 'em_andamento': case 'produzido': return 'andamento';
    case 'enviado': return 'aprovacao';
    case 'ajustes': return 'ajustes';
    case 'aprovado': return 'aprovados';
    case 'entregue': return 'finalizados';
    default: return t.area === 'diagramacao' ? 'diagramacao' : t.area === 'social_media' ? 'social_media' : 'outro';
  }
}

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const TEAM_OPEN = ['solicitada', 'a_fazer', 'em_andamento', 'produzido'];
/** Entrega prevista: a combinada + os dias em que o cliente segurou a demanda (o relógio da equipe para enquanto ela está com o cliente). */
export function adjustedDue(t: Pick<BoardTask, 'status' | 'due_on' | 'client_wait_days'>): string | null {
  const wait = Math.ceil(t.client_wait_days ?? 0);
  return t.due_on && wait > 0 && TEAM_OPEN.includes(t.status) ? addDays(t.due_on, wait) : t.due_on;
}

export interface Lateness { late: boolean; days: number; due: string | null; side: 'cliente' | 'equipe' | null; what: string }
/** Atraso de um cartão: aprovação e conteúdo pendentes contam para o cliente; entrega e alterações, para a equipe. */
export function lateness(t: Pick<BoardTask, 'status' | 'due_on' | 'review_due_on' | 'changes_due_on' | 'client_wait_days'>, today: string): Lateness {
  const none: Lateness = { late: false, days: 0, due: null, side: null, what: '' };
  const pick = (): { due: string | null; side: 'cliente' | 'equipe'; what: string } | null => {
    switch (t.status) {
      case 'enviado': return { due: t.review_due_on ?? t.due_on, side: 'cliente', what: 'Devolução da revisão' };
      case 'aguardando_cliente': return { due: t.due_on, side: 'cliente', what: 'Envio do conteúdo' };
      case 'ajustes': return { due: t.changes_due_on ?? t.due_on, side: 'equipe', what: 'Entrega das alterações' };
      case 'solicitada': case 'a_fazer': case 'em_andamento': case 'produzido': return { due: adjustedDue(t), side: 'equipe', what: 'Entrega' };
      default: return null;
    }
  };
  const p = pick();
  if (!p || !p.due || p.due >= today) return p ? { ...none, due: p.due, side: p.side, what: p.what } : none;
  return { late: true, days: Math.round((Date.parse(today) - Date.parse(p.due)) / 86_400_000), due: p.due, side: p.side, what: p.what };
}

/** Janela da linha do tempo: do menor início/entrega ao maior, com folga; devolve a posição (%) das barras, das segundas-feiras e de hoje. */
export function timelineRange(tasks: Pick<BoardTask, 'starts_on' | 'due_on'>[], today: string) {
  const days = tasks.flatMap((t) => [t.starts_on, t.due_on]).filter((d): d is string => !!d).concat(today).map((d) => Date.parse(d));
  const min = Math.min(...days) - 3 * 86_400_000, max = Math.max(...days) + 3 * 86_400_000;
  const span = Math.max(max - min, 14 * 86_400_000);
  const pos = (d: string) => Math.min(100, Math.max(0, ((Date.parse(d) - min) / span) * 100));
  const bar = (t: Pick<BoardTask, 'starts_on' | 'due_on'>) => {
    const a = t.starts_on ?? t.due_on, b = t.due_on ?? t.starts_on; if (!a || !b) return null;
    const left = pos(a < b ? a : b), right = pos(a < b ? b : a);
    return { left, width: Math.max(right - left, 1.2) };
  };
  const ticks: { label: string; left: number }[] = [];
  const first = new Date(min); first.setUTCHours(0, 0, 0, 0); first.setUTCDate(first.getUTCDate() + ((8 - first.getUTCDay()) % 7));
  for (let d = first.getTime(); d <= min + span; d += 7 * 86_400_000) ticks.push({ label: new Date(d).toISOString().slice(8, 10) + '/' + new Date(d).toISOString().slice(5, 7), left: ((d - min) / span) * 100 });
  return { pos, bar, ticks, todayLeft: pos(today) };
}

/** Nomes de todos os responsáveis (principal primeiro, sem repetir). */
export const peopleOf = (t: Pick<BoardTask, 'assignee' | 'assignees'>): string[] => [...new Set([...(t.assignee ? [t.assignee] : []), ...(t.assignees ?? [])])];
