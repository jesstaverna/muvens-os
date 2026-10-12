import { describe, it, expect } from 'vitest';
import { buildProposal } from './proposal';
import { buildReport } from './report';
import { segmentFor } from './market';

describe('proposta e mercado', () => {
  it('sem site → começa por site', () => {
    const r = buildReport({ name: 'X', site: null, score: 70, observations: [], analyzed: true, service: 'site_institucional' });
    expect(buildProposal(r)[0].service).toBe('site_institucional');
  });
  it('tudo ok → consultoria', () => {
    expect(buildProposal({ headline: '', level: 'baixa', score: 5, pillars: [], opportunities: [], service: null, strengths: [] })[0].service).toBe('consultoria');
  });
  it('segmento por categoria', () => {
    expect(segmentFor('Clínica odontológica', null).key).toBe('saude');
    expect(segmentFor('Metalúrgica', 'Metalúrgica (Curitiba)').key).toBe('industria');
    expect(segmentFor('xyz').key).toBe('geral');
  });
});
