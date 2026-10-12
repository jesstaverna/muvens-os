import { describe, it, expect } from 'vitest';
import { buildReport } from './report';
import { analyzeHtml } from './analysis';

describe('buildReport', () => {
  it('sem análise: tudo desconhecido', () => {
    const r = buildReport({ name: 'X', website: 'https://x.com', site: null, observations: [], analyzed: false });
    expect(r.level).toBe('indefinida'); expect(r.pillars.find((p) => p.key === 'conversao')!.status).toBe('desconhecido');
  });
  it('sem site: pilar site ausente e oportunidade alta', () => {
    const r = buildReport({ name: 'X', site: null, score: 70, observations: ['Não encontramos um site da empresa'], analyzed: true });
    expect(r.pillars[0].status).toBe('ausente'); expect(r.level).toBe('alta');
  });
  it('com site: aponta o que falta e os pontos fortes', () => {
    const site = analyzeHtml('<html><head><meta name="viewport" content="x"></head><a href="https://wa.me/5541999998888">z</a></html>', 'https://x.com');
    const r = buildReport({ name: 'X', website: 'https://x.com', site, score: 40, observations: [], analyzed: true });
    expect(r.strengths).toContain('Adaptado para celular'); expect(r.pillars.find((p) => p.key === 'anuncios')!.status).toBe('ausente');
  });
});
