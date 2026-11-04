import { describe, expect, it } from 'vitest';
import { adjustedDue, columnOf, lateness, timelineRange } from './board';

describe('quadro do cliente', () => {
  it('coloca cada status na coluna certa', () => {
    expect(columnOf({ status: 'solicitada', area: 'diagramacao' })).toBe('diagramacao');
    expect(columnOf({ status: 'a_fazer', area: 'social_media' })).toBe('social_media');
    expect(columnOf({ status: 'aguardando_cliente', area: null })).toBe('outro');
    expect(columnOf({ status: 'produzido', area: 'diagramacao' })).toBe('andamento');
    expect(columnOf({ status: 'enviado', area: 'social_media' })).toBe('aprovacao');
    expect(columnOf({ status: 'ajustes', area: null })).toBe('ajustes');
    expect(columnOf({ status: 'aprovado', area: null })).toBe('aprovados');
    expect(columnOf({ status: 'entregue', area: null })).toBe('finalizados');
  });
  it('atraso: aprovação é do cliente, entrega e alterações são da equipe, concluídas nunca atrasam', () => {
    const base = { due_on: '2026-11-10', review_due_on: null, changes_due_on: null };
    expect(lateness({ ...base, status: 'em_andamento' }, '2026-11-12')).toMatchObject({ late: true, days: 2, side: 'equipe' });
    expect(lateness({ ...base, status: 'enviado', review_due_on: '2026-11-11' }, '2026-11-12')).toMatchObject({ late: true, days: 1, side: 'cliente', what: 'Devolução da revisão' });
    expect(lateness({ ...base, status: 'ajustes', changes_due_on: '2026-11-13' }, '2026-11-12').late).toBe(false);
    expect(lateness({ ...base, status: 'aguardando_cliente' }, '2026-11-12').side).toBe('cliente');
    expect(lateness({ ...base, status: 'entregue' }, '2026-12-12').late).toBe(false);
    expect(lateness({ ...base, due_on: null, status: 'a_fazer' }, '2026-12-12').late).toBe(false);
  });
  it('linha do tempo: barras dentro da janela e marcador de hoje', () => {
    const r = timelineRange([{ starts_on: '2026-11-02', due_on: '2026-11-20' }, { starts_on: null, due_on: '2026-11-30' }], '2026-11-10');
    const b = r.bar({ starts_on: '2026-11-02', due_on: '2026-11-20' })!;
    expect(b.left).toBeGreaterThan(0); expect(b.left + b.width).toBeLessThanOrEqual(100); expect(r.todayLeft).toBeGreaterThan(b.left);
    expect(r.bar({ starts_on: null, due_on: null })).toBeNull(); expect(r.ticks.length).toBeGreaterThan(3);
  });
  it('relógio pausado: a espera do cliente empurra a entrega e tira o atraso da equipe', () => {
    const t = { status: 'em_andamento', due_on: '2026-11-10', review_due_on: null, changes_due_on: null, client_wait_days: 3.2 };
    expect(adjustedDue(t)).toBe('2026-11-14');
    expect(lateness(t, '2026-11-13').late).toBe(false);
    expect(lateness(t, '2026-11-16')).toMatchObject({ late: true, days: 2, side: 'equipe' });
    expect(adjustedDue({ ...t, status: 'enviado' })).toBe('2026-11-10');          // com o cliente: prazo é a devolução da revisão
    expect(adjustedDue({ ...t, client_wait_days: 0 })).toBe('2026-11-10');
  });
});
