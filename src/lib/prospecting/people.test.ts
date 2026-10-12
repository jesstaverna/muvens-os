import { describe, it, expect } from 'vitest';
import { extractPeople } from './people';
describe('extractPeople', () => {
  it('acha diretor comercial com nome e direção', () => {
    const p = extractPeople('<p>Carlos Silva, Diretor Comercial</p><div>Fundadora: Ana Souza</div>');
    expect(p.find((x) => x.role === 'comercial')?.name).toBe('Carlos Silva');
    expect(p.some((x) => x.role === 'direcao')).toBe(true);
  });
  it('vazio quando não há', () => expect(extractPeople('<p>olá</p>')).toEqual([]));
});
