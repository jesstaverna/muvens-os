import { describe, expect, it } from 'vitest';
import { groupCampaigns, slug } from './groups';

describe('groupCampaigns', () => {
  it('junta campanhas do mesmo nicho e cidade, ignorando acento e caixa', () => {
    const g = groupCampaigns([
      { id: '1', niche: 'Clínica odontológica', city: 'Curitiba', created_at: '2026-10-01' },
      { id: '2', niche: 'clinica odontologica ', city: 'CURITIBA', created_at: '2026-10-05' },
      { id: '3', niche: 'Indústria', city: 'Curitiba', created_at: '2026-10-03' },
    ]);
    expect(g.size).toBe(2);
    const od = g.get('clinica-odontologica--curitiba')!;
    expect(od.ids).toEqual(['1', '2']); expect(od.latest).toBe('2026-10-05');
    expect(g.get('industria--curitiba')!.ids).toEqual(['3']);
  });
  it('slug é seguro para URL', () => { expect(slug('São José dos Pinhais / PR')).toBe('sao-jose-dos-pinhais-pr'); });
});
