import { describe, expect, it } from 'vitest';
import { buildFunnel } from './funnel';

const P = (id: string, extra: Record<string, unknown> = {}) => ({ id, status: 'analisado', source: 'google_maps', lead_id: null, analyzed_at: '2026-10-01', report_first_viewed_at: null, ...extra }) as never;
describe('funil comercial', () => {
  it('conta cada etapa, converte e soma valores', () => {
    const prospects = [P('1', { status: 'contatado', lead_id: 'L1', report_first_viewed_at: 'x' }), P('2', { status: 'contatado', lead_id: 'L2' }), P('3', { source: 'inbound', status: 'novo', lead_id: 'L3', analyzed_at: null }), P('4', { analyzed_at: null, status: 'novo' })];
    const leads = [{ id: 'L1', kind: 'won', position: 8, potential_value: 0 }, { id: 'L2', kind: 'open', position: 3, potential_value: 0 }, { id: 'L3', kind: 'open', position: 1, potential_value: 0 }] as never[];
    const proposals = [{ lead_id: 'L1', status: 'aceita', total_value: 3000, sent_at: '2026-10-01', updated_at: null }, { lead_id: 'L2', status: 'enviada', total_value: 1200, sent_at: '2026-10-01T00:00:00Z', updated_at: null }] as never[];
    const quals = [{ lead_id: 'L3', fit: 'quente', status: 'respondido' }] as never[];
    const f = buildFunnel(prospects, leads, proposals, quals, new Date('2026-10-13T00:00:00Z'));
    const by = Object.fromEntries(f.stages.map((s) => [s.key, s.count]));
    expect(by).toMatchObject({ encontradas: 4, analisadas: 2, contatadas: 2, leads: 3, qualificados: 3, propostas: 2, fechadas: 1 });
    expect(f.wonValue).toBe(3000); expect(f.openValue).toBe(1200); expect(f.hotWithoutProposal).toBe(1); expect(f.proposalsStale).toBe(1);
    expect(f.landingOpened).toBe(1); expect(f.stages[1].convFromPrev).toBe(50); expect(f.stages.find((x) => x.key === 'leads')!.convFromPrev).toBeNull(); expect(f.stages[0].convFromPrev).toBeNull();
  });
  it('vazio não quebra', () => { const f = buildFunnel([], [], [], []); expect(f.total).toBe(0); expect(f.stages.every((s) => s.count === 0)).toBe(true); });
});
