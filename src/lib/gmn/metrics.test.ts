import { describe, expect, it } from 'vitest';
import { delta, monthLabel, monthStart, parseMetrics } from './metrics';

describe('relatório do Google Meu Negócio', () => {
  it('lê números com vírgula, ignora vazios e valida limites', () => {
    const f: Record<string, string> = { calls: '12', rating: '4,6', views_maps: '', directions: '0' };
    const r = parseMetrics((k) => f[k]); expect(r.ok).toBe(true); if (r.ok) expect(r.metrics).toEqual({ calls: 12, rating: 4.6, directions: 0 });
    expect(parseMetrics((k) => ({ calls: '-1' } as Record<string, string>)[k]).ok).toBe(false);
    expect(parseMetrics((k) => ({ rating: '5,5' } as Record<string, string>)[k]).ok).toBe(false);
    expect(parseMetrics((k) => ({ calls: 'abc' } as Record<string, string>)[k]).ok).toBe(false);
  });
  it('variação: percentual, nota em pontos e casos de base zero', () => {
    expect(delta('calls', 15, 10)).toEqual({ text: '+50% vs. mês anterior', up: true }); expect(delta('calls', 5, 10)!.up).toBe(false);
    expect(delta('rating', 4.7, 4.5)!.text).toBe('+0,2 vs. mês anterior'); expect(delta('calls', 3, 0)!.text).toBe('novo no mês'); expect(delta('calls', 3, undefined)).toBeNull();
  });
  it('mês', () => { expect(monthStart('2026-10')).toBe('2026-10-01'); expect(monthStart('x')).toBeNull(); expect(monthLabel('2026-10-01')).toContain('outubro'); });
});
