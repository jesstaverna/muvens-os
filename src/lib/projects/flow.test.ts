import { describe, expect, it } from 'vitest';
import { columnTarget, statusPath } from './flow';

describe('mover cartões entre colunas', () => {
  it('percorre as etapas intermediárias que o banco exige', () => {
    expect(statusPath('a_fazer', 'em_andamento')).toEqual(['em_andamento']);
    expect(statusPath('a_fazer', 'enviado')).toEqual(['em_andamento', 'produzido', 'enviado']);
    expect(statusPath('em_andamento', 'aprovado')).toEqual(['produzido', 'enviado', 'aprovado']);
    expect(statusPath('solicitada', 'entregue')).toEqual(['a_fazer', 'em_andamento', 'produzido', 'enviado', 'aprovado', 'entregue']);
    expect(statusPath('enviado', 'ajustes')).toEqual(['ajustes']);
    expect(statusPath('ajustes', 'enviado')).toEqual(['enviado']);
  });
  it('volta direto e não mexe em quem já está no destino', () => {
    expect(statusPath('aprovado', 'em_andamento')).toEqual(['em_andamento']);
    expect(statusPath('enviado', 'a_fazer')).toEqual(['a_fazer']);
    expect(statusPath('em_andamento', 'em_andamento')).toEqual([]);
  });
  it('voltar para uma etapa de aprovação refaz o caminho permitido', () => {
    expect(statusPath('aprovado', 'ajustes')).toEqual(['produzido', 'enviado', 'ajustes']);
    expect(statusPath('aprovado', 'enviado')).toEqual(['produzido', 'enviado']);
    expect(statusPath('ajustes', 'enviado')).toEqual(['enviado']);
  });
  it('não reabre entregue/cancelada', () => { expect(statusPath('entregue', 'em_andamento')).toBeNull(); expect(statusPath('cancelada', 'a_fazer')).toBeNull(); });
  it('colunas de área definem a área; as demais só o status', () => {
    expect(columnTarget('diagramacao')).toEqual({ status: 'a_fazer', area: 'diagramacao' });
    expect(columnTarget('aprovacao')).toEqual({ status: 'enviado' });
    expect(columnTarget('finalizados')).toEqual({ status: 'entregue' });
  });
});
