/** Filtros puros do painel de produção: nunca alteram dados nem permissões. */
export type ProductionFocus =
  | 'todas' | 'atrasadas' | 'hoje' | 'proximos7' | 'revisao'
  | 'aguardando_cliente' | 'sem_responsavel' | 'prioritarias';

export interface ProductionTask {
  id: string;
  title: string;
  project_id: string;
  status: string;
  priority: string;
  late: boolean;
  effective_due: string | null;
  assignee_id: string | null;
  assignee_ids: string[];
  assignee: string | null;
  assignees: string[];
  client: string | null;
  project: string | null;
}

export const OPEN_STATUSES = new Set([
  'solicitada', 'aguardando_cliente', 'a_fazer', 'em_andamento',
  'produzido', 'enviado', 'ajustes',
]);

export function isOpenTask(task: Pick<ProductionTask, 'status'>) {
  return OPEN_STATUSES.has(task.status);
}

export function datePlusDays(today: string, days: number) {
  const ms = Date.parse(today + 'T12:00:00Z');
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

export function productionSummary<T extends ProductionTask>(tasks: T[], today: string) {
  const open = tasks.filter(isOpenTask);
  const next7 = datePlusDays(today, 7);
  const upcoming = open
    .filter((t) => t.effective_due && t.effective_due >= today && t.effective_due <= next7)
    .sort((a, b) => (a.effective_due ?? '').localeCompare(b.effective_due ?? ''));

  return {
    open: open.length,
    late: open.filter((t) => t.late).length,
    review: open.filter((t) => t.status === 'produzido' || t.status === 'enviado').length,
    clientWaiting: open.filter((t) => t.status === 'aguardando_cliente').length,
    noOwner: open.filter((t) => !t.assignee_id && t.assignee_ids.length === 0).length,
    priorities: open.filter((t) => t.priority === 'urgente' || t.priority === 'alta').length,
    today: upcoming.filter((t) => t.effective_due === today).length,
    upcoming,
  };
}

export function filterProductionTasks<T extends ProductionTask>(
  tasks: T[],
  options: {
    focus?: ProductionFocus | string;
    priority?: string;
    query?: string;
    ownerId?: string;
    today: string;
  },
): T[] {
  const { focus = 'todas', priority, query, ownerId, today } = options;
  const search = (query ?? '').trim().toLocaleLowerCase('pt-BR').slice(0, 100);
  const next7 = datePlusDays(today, 7);
  return tasks.filter((t) => {
    if (priority && t.priority !== priority) return false;
    if (ownerId && t.assignee_id !== ownerId && !t.assignee_ids.includes(ownerId)) return false;
    if (search && ![t.title, t.client, t.project].some((value) => (value ?? '').toLocaleLowerCase('pt-BR').includes(search))) return false;
    switch (focus) {
      case 'atrasadas': return isOpenTask(t) && t.late;
      case 'hoje': return isOpenTask(t) && t.effective_due === today;
      case 'proximos7': return isOpenTask(t) && !!t.effective_due && t.effective_due >= today && t.effective_due <= next7;
      case 'revisao': return isOpenTask(t) && ['produzido', 'enviado'].includes(t.status);
      case 'aguardando_cliente': return t.status === 'aguardando_cliente';
      case 'sem_responsavel': return isOpenTask(t) && !t.assignee_id && t.assignee_ids.length === 0;
      case 'prioritarias': return isOpenTask(t) && ['urgente', 'alta'].includes(t.priority);
      default: return true;
    }
  });
}
