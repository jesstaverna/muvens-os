import { describe, expect, it } from 'vitest';
import { FIELDS_EXTENDED, mapPlaces } from './places-map';
import { buildReport } from './report';

describe('detalhes do perfil do Google', () => {
  const api = { places: [{ id: 'a', displayName: { text: 'Padaria X' }, photos: [{}, {}, {}], regularOpeningHours: { periods: [] }, businessStatus: 'OPERATIONAL' }, { id: 'b', displayName: { text: 'Sem dados' } }] };
  it('mapeia fotos, horário e situação só no modo estendido', () => {
    expect(mapPlaces(api)[0].details).toBeUndefined();
    const [a, b] = mapPlaces(api, true);
    expect(a.details).toEqual({ photos_count: 3, has_hours: true, business_status: 'OPERATIONAL' }); expect(b.details).toEqual({ photos_count: 0, has_hours: false, business_status: null });
    expect(FIELDS_EXTENDED).toContain('places.photos'); expect(FIELDS_EXTENDED).toContain('places.regularOpeningHours');
  });
  it('o pilar do Google usa os detalhes quando existem', () => {
    const g = (d: any) => buildReport({ name: 'X', category: 'Padaria', website: 'https://x.com', rating: 4.8, reviews: 40, hasPhone: true, fromGoogle: true, googleDetails: d, site: null, observations: [], analyzed: true }).pillars.find((p) => p.key === 'google')!;
    expect(g({ photos_count: 2, has_hours: false }).items.some((i) => i.label.startsWith('Fotos no perfil (2)') && i.ok === false)).toBe(true);
    expect(g({ photos_count: 10, has_hours: true }).items.filter((i) => i.ok === false).length).toBe(0);
    expect(g(null).items.some((i) => i.label.startsWith('Fotos no perfil'))).toBe(false);
  });
});
