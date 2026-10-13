import { describe, expect, it } from 'vitest';
import { pct, periods } from './summary';

describe('resumo: períodos e variação', () => {
  it('período atual e anterior têm o mesmo tamanho e não se sobrepõem', () => {
    const now = new Date('2026-10-13T12:00:00Z'); const { cur, prev } = periods(7, now);
    expect(cur.until).toBe(now.toISOString()); expect(prev.until).toBe(cur.since);
    expect(new Date(cur.until).getTime() - new Date(cur.since).getTime()).toBe(7 * 86400_000);
    expect(new Date(prev.until).getTime() - new Date(prev.since).getTime()).toBe(7 * 86400_000);
  });
  it('pct: crescimento, queda, zero e base zero', () => { expect(pct(15, 10)).toBe(50); expect(pct(5, 10)).toBe(-50); expect(pct(0, 0)).toBe(0); expect(pct(3, 0)).toBeNull(); });
});
