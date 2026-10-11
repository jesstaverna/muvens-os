import 'server-only';

import { FIELDS, mapPlaces, type PlaceResult } from '@/lib/prospecting/places-map';
export type { PlaceResult };

export const placesConfigured = () => !!process.env.GOOGLE_PLACES_API_KEY;

/**
 * Text Search da Places API (New). A chave fica só no servidor. NÃO testado contra a API real nesta entrega
 * (sem credencial no ambiente de desenvolvimento) — valide em homologação e confira cotas/custos/termos no Google Cloud.
 */
export async function searchPlaces(niche: string, city: string, max = 20): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY não configurada (integração pendente)');
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({ textQuery: `${niche} em ${city}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: Math.min(Math.max(max, 1), 20) }),
  });
  if (!res.ok) throw new Error(`Google Places respondeu ${res.status}`);
  return mapPlaces(await res.json());
}
