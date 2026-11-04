import { describe, expect, it } from 'vitest';
import { peopleByProject, projectsByPerson, type PProject, type PTask } from './people';

const P1: PProject = { id: 'p1', name: 'Redes — Nov', status: 'em_andamento', client_id: 'c1', client: 'P&A', owner_id: 'u-owner', client_visible: true };
const P2: PProject = { id: 'p2', name: 'Livro X', status: 'em_andamento', client_id: 'c1', client: 'P&A', owner_id: null, client_visible: false };
const team = [{ id: 'u-owner', name: 'Jessica' }, { id: 'u-dani', name: 'Dani' }, { id: 'u-caio', name: 'Caio' }];
const tasks: PTask[] = [
  { id: 't1', status: 'em_andamento', project_id: 'p1', assignee_id: 'u-dani', co: ['u-caio'], contacts: ['k1'] },
  { id: 't2', status: 'entregue', project_id: 'p1', assignee_id: 'u-dani', co: [], contacts: ['k1', 'k2'] },
  { id: 't3', status: 'cancelada', project_id: 'p1', assignee_id: 'u-caio', co: [], contacts: ['k2'] },
  { id: 't4', status: 'a_fazer', project_id: 'p2', assignee_id: 'u-caio', co: [], contacts: [] },
];
const contacts = [{ id: 'k1', client_id: 'c1', name: 'Diego', role_title: 'CEO', is_primary: true }, { id: 'k2', client_id: 'c1', name: 'Andre', role_title: null, is_primary: false }, { id: 'k9', client_id: 'c9', name: 'Outro', role_title: null, is_primary: false }];
const users = [{ id: 'x1', client_id: 'c1', name: 'Diego', email: 'd@x.com', active: true }, { id: 'x2', client_id: 'c9', name: 'Fora', email: null, active: true }];

describe('pessoas por projeto', () => {
  const rows = peopleByProject([P1, P2], tasks, team, contacts, users);
  it('equipe: dono do projeto primeiro, responsáveis e colaboradores com contagem (cancelada não conta)', () => {
    expect(rows[0].team.map((t) => [t.name, t.role, t.tasks, t.open])).toEqual([['Jessica', 'Responsável do projeto', 0, 0], ['Dani', 'Responsável', 2, 1], ['Caio', 'Colaborador', 1, 1]]);
    expect(rows[1].team.map((t) => [t.name, t.role])).toEqual([['Caio', 'Responsável']]);
  });
  it('contatos do cliente só os que participam de tarefas do projeto, da mesma empresa', () => {
    expect(rows[0].contacts.map((c) => [c.name, c.tasks, c.primary])).toEqual([['Diego', 2, true], ['Andre', 1, false]]);   // a tarefa cancelada não conta
    expect(rows[1].contacts).toEqual([]);
  });
  it('usuários do portal só se o projeto está liberado e só da empresa certa', () => {
    expect(rows[0].portalUsers.map((u) => u.id)).toEqual(['x1']); expect(rows[1].portalUsers).toEqual([]);
  });
  it('visão por pessoa', () => {
    const by = projectsByPerson(rows);
    expect(by.map((p) => p.name)).toEqual(['Caio', 'Dani', 'Jessica']);
    expect(by.find((p) => p.name === 'Caio')!.projects.map((p) => [p.name, p.role])).toEqual([['Redes — Nov', 'Colaborador'], ['Livro X', 'Responsável']]);
  });
});
