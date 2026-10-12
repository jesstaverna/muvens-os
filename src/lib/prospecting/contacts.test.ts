import { describe, expect, it } from 'vitest';
import { pickContactLinks } from './contacts';
import { extractPeople } from './people';

describe('pickContactLinks', () => {
  const html = '<a href="/contato">c</a><a href="/compras">x</a><a href="https://outro.com/contato">ext</a><a href="/foto.png">i</a><a href="/blog">b</a><a href="/sobre-nos">s</a><a href="/equipe">e</a>';
  it('só mesmo domínio, prioriza compras/comercial e limita', () => {
    const l = pickContactLinks(html, 'https://empresa.com.br/', 3);
    expect(l[0]).toBe('https://empresa.com.br/compras'); expect(l.length).toBe(3); expect(l.some((u) => u.includes('outro.com') || u.endsWith('.png') || u.includes('blog'))).toBe(false);
  });
});
describe('compras em people', () => {
  it('acha gerente de compras', () => { expect(extractPeople('<p>Maria Souza, Gerente de Compras</p>').some((p) => p.role === 'compras' && p.name === 'Maria Souza')).toBe(true); });
});
