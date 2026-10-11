import { describe, expect, it } from 'vitest';
import { runPool } from './pool';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
describe('runPool', () => {
  it('respeita o limite de paralelismo e processa tudo', async () => {
    let running = 0, peak = 0;
    const { results, skipped } = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { running++; peak = Math.max(peak, running); await sleep(10); running--; return n * 2; });
    expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12, 14]); expect(skipped).toEqual([]); expect(peak).toBeLessThanOrEqual(3); expect(peak).toBeGreaterThan(1);
  });
  it('para de iniciar itens após o prazo e devolve os pulados', async () => {
    const { results, skipped } = await runPool([1, 2, 3, 4, 5, 6], 1, async (n) => { await sleep(30); return n; }, 50);
    expect(results.length).toBeGreaterThan(0); expect(results.length).toBeLessThan(6); expect(results.length + skipped.length).toBe(6);
  });
  it('lista vazia não trava', async () => { expect(await runPool([], 4, async () => 1)).toEqual({ results: [], skipped: [] }); });
});
