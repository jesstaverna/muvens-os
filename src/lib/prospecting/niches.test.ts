import { describe, expect, it } from 'vitest';
import { NICHE_GROUPS, suggestNiches } from './niches';

describe('suggestNiches', () => {
  it('"indústria" (com ou sem acento/caixa) sugere os tipos de indústria', () => {
    for (const t of ['indústria', 'INDUSTRIA', 'indus', 'fábrica']) { const s = suggestNiches(t); expect(s.groups.map((g) => g.key), t).toContain('industria'); }
    const g = suggestNiches('indústria').groups[0];
    expect(g.options.map((o) => o.label)).toEqual(expect.arrayContaining(['Metalúrgica e siderúrgica', 'Têxtil e confecção', 'Alimentícia']));
  });
  it('texto vazio lista as áreas', () => { expect(suggestNiches('').groups.length).toBe(NICHE_GROUPS.length); });
  it('termo específico encontra a opção em outra área', () => {
    const s = suggestNiches('odonto'); expect(s.options.some((x) => x.label === 'Clínica odontológica')).toBe(true);
  });
  it('catálogo consistente: chaves únicas e termos de busca preenchidos', () => {
    expect(new Set(NICHE_GROUPS.map((g) => g.key)).size).toBe(NICHE_GROUPS.length);
    for (const g of NICHE_GROUPS) for (const o of g.options) { expect(o.q.length).toBeGreaterThan(2); expect(o.label.length).toBeGreaterThan(2); }
  });
});
