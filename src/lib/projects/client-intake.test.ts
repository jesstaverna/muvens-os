import { describe, expect, it } from 'vitest';
import { COLUMNS, columnOf } from './board';
import { columnTarget, statusPath } from './flow';

describe('solicitações de cliente: entrada no board', () => {
  it('reserva a primeira coluna para pedidos recém-enviados', () => {
    expect(COLUMNS[0]).toEqual({ key: 'solicitacoes_cliente', label: 'Solicitação de cliente' });
    expect(columnOf({ status: 'solicitada', area: 'social_media' })).toBe('solicitacoes_cliente');
    expect(columnOf({ status: 'solicitada', area: 'diagramacao' })).toBe('solicitacoes_cliente');
    expect(columnOf({ status: 'solicitada', area: 'outro' })).toBe('solicitacoes_cliente');
  });
  it('após triagem, utiliza a área e os estados de produção normais', () => {
    expect(columnOf({ status: 'a_fazer', area: 'social_media' })).toBe('social_media');
    expect(columnOf({ status: 'a_fazer', area: 'diagramacao' })).toBe('diagramacao');
    expect(columnOf({ status: 'em_andamento', area: 'social_media' })).toBe('andamento');
    expect(statusPath('solicitada','a_fazer')).toEqual(['a_fazer']);
    expect(columnTarget('solicitacoes_cliente')).toEqual({ status:'solicitada' });
  });
});
