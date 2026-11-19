import { describe, expect, it } from 'vitest';
import { taskCode, taskDisplayTitle } from './task-label';

describe('identificação global de tarefas', () => {
  it('começa em cinco dígitos e cresce naturalmente', () => {
    expect(taskCode(1)).toBe('#00001');
    expect(taskCode(12)).toBe('#00012');
    expect(taskCode(100000)).toBe('#100000');
    expect(taskCode(null)).toBe('');
  });
  it('combina ID, nome do cliente e título sem alterar o texto informado', () => {
    expect(taskDisplayTitle(1, 'Muvens', 'Criar calendário editorial'))
      .toBe('#00001 [MUVENS] Criar calendário editorial');
    expect(taskDisplayTitle('24', 'Notta10', 'Revisar landing page'))
      .toBe('#00024 [NOTTA10] Revisar landing page');
    expect(taskDisplayTitle(null, null, 'Tarefa antiga')).toBe('Tarefa antiga');
  });
});
