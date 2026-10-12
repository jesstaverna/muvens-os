import { describe, expect, it } from 'vitest';
import { illustrationKey } from './illustration';
describe('illustrationKey', () => {
  it('escolhe pelo tipo de empresa', () => {
    expect(illustrationKey('Clínica odontológica', 'saude')).toBe('dente');
    expect(illustrationKey('Escritório de advocacia', 'servicos')).toBe('balanca');
    expect(illustrationKey('Escritório de contabilidade', 'servicos')).toBe('calculadora');
    expect(illustrationKey('Metalúrgica', 'industria')).toBe('industria');
    expect(illustrationKey('Fábrica de ração para pet', 'industria')).toBe('pet');
    expect(illustrationKey('Loja de materiais de construção', 'construcao')).toBe('construcao');
    expect(illustrationKey('Clínica médica', 'saude')).toBe('saude');
  });
  it('sem regra usa o segmento', () => { expect(illustrationKey('xyz', 'varejo')).toBe('varejo'); expect(illustrationKey(null, 'geral')).toBe('geral'); });
});
