import { describe, expect, it } from 'vitest';
import { resolveAssignees } from './assignees';

const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000a2', C = '00000000-0000-0000-0000-0000000000a3';
const form = (assignee: string[], primary?: string) => ({ getAll: (k: string) => (k === 'assignee' ? assignee : []), get: (k: string) => (k === 'assignee_primary' ? primary ?? null : null) });

describe('responsáveis da tarefa', () => {
  it('vários marcados: o principal escolhido e os outros', () => expect(resolveAssignees(form([A, B, C], B))).toEqual({ principal: B, others: [A, C] }));
  it('sem principal escolhido: o primeiro marcado', () => expect(resolveAssignees(form([B, C]))).toEqual({ principal: B, others: [C] }));
  it('principal escolhido mas não marcado entra na lista', () => expect(resolveAssignees(form([A], C))).toEqual({ principal: C, others: [A] }));
  it('ninguém: sem responsável', () => expect(resolveAssignees(form([]))).toEqual({ principal: null, others: [] }));
  it('ignora valores inválidos e repetidos', () => expect(resolveAssignees(form([A, A, 'x', ''], 'nao-uuid'))).toEqual({ principal: A, others: [] }));
});
