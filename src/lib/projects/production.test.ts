import { describe, expect, it } from 'vitest';
import { datePlusDays, filterProductionTasks, productionSummary, type ProductionTask } from './production';

const base: ProductionTask = {
  id: 'a', title: 'Carrossel Instagram', project_id: 'p', status: 'em_andamento',
  priority: 'alta', late: false, effective_due: '2026-11-17',
  assignee_id: 'designer', assignee_ids: [], assignee: 'Ana',
  assignees: [], client: 'Cliente Exemplo', project: 'Social Media',
};
const tasks: ProductionTask[] = [
  base,
  { ...base, id: 'b', title: 'Revisar criativos', status: 'enviado', priority: 'media', effective_due: '2026-11-19', assignee_id: null, assignee_ids: ['designer'], late: false },
  { ...base, id: 'c', title: 'Briefing', status: 'aguardando_cliente', priority: 'baixa', effective_due: '2026-11-10', assignee_id: null, assignee_ids: [], late: true },
  { ...base, id: 'd', title: 'Entrega final', status: 'entregue', priority: 'urgente', late: false, effective_due: '2026-11-10' },
];

describe('painel da produção', () => {
  it('conta apenas tarefas abertas em indicadores e distingue aprovação de espera de conteúdo', () => {
    expect(productionSummary(tasks, '2026-11-17')).toMatchObject({
      open: 3, late: 1, review: 1, clientWaiting: 1,
      noOwner: 1, priorities: 1, today: 1,
    });
  });
  it('considera responsável secundário e busca textual', () => {
    expect(filterProductionTasks(tasks, { today: '2026-11-17', ownerId: 'designer', focus: 'revisao' }).map((t) => t.id)).toEqual(['b']);
    expect(filterProductionTasks(tasks, { today: '2026-11-17', query: 'CARROSSEL', priority: 'alta' }).map((t) => t.id)).toEqual(['a']);
  });
  it('filtra atrasadas e não inclui entregues em tarefas urgentes em aberto', () => {
    expect(filterProductionTasks(tasks, { today: '2026-11-17', focus: 'atrasadas' }).map((t) => t.id)).toEqual(['c']);
    expect(filterProductionTasks(tasks, { today: '2026-11-17', focus: 'prioritarias' }).map((t) => t.id)).toEqual(['a']);
  });
  it('avança datas corretamente na virada do mês e ano', () => {
    expect(datePlusDays('2026-12-29', 7)).toBe('2027-01-05');
    expect(filterProductionTasks(tasks, { today: '2026-11-17', focus: 'proximos7' }).map((t) => t.id)).toEqual(['a', 'b']);
  });
});
