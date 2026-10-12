import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './google-places';

const page = (ids: string[], next?: string) => ({ ok: true, json: async () => ({ places: ids.map((id) => ({ id, displayName: { text: `Empresa ${id}` } })), ...(next ? { nextPageToken: next } : {}) }) });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.GOOGLE_PLACES_API_KEY; });

describe('searchPlaces com paginação', () => {
  it('segue o nextPageToken até o limite de páginas', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    const f = vi.fn().mockResolvedValueOnce(page(['a', 'b'], 't1')).mockResolvedValueOnce(page(['c'], 't2')).mockResolvedValueOnce(page(['d']));
    vi.stubGlobal('fetch', f);
    const r = await searchPlaces('escola', 'Curitiba', 20, 3);
    expect(r.map((x) => x.place_id)).toEqual(['a', 'b', 'c', 'd']); expect(f).toHaveBeenCalledTimes(3);
    expect(JSON.parse(f.mock.calls[1][1].body).pageToken).toBe('t1');
  });
  it('1 página por padrão e para quando não há token', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    const f = vi.fn().mockResolvedValue(page(['a'], 't1')); vi.stubGlobal('fetch', f);
    expect((await searchPlaces('x', 'y')).length).toBe(1); expect(f).toHaveBeenCalledTimes(1);
  });
});
