import 'server-only';

import { FIELDS, FIELDS_EXTENDED, mapPlaces, type PlaceResult } from '@/lib/prospecting/places-map';
export type { PlaceResult };

/** Com GOOGLE_PLACES_EXTENDED=1 a busca pede também fotos, horários e situação do negócio (confira o custo dessas informações no Google Cloud). */
export const placesExtended = () => process.env.GOOGLE_PLACES_EXTENDED === '1';
export const placesConfigured = () => !!process.env.GOOGLE_PLACES_API_KEY;

/**
 * Text Search da Places API (New). A chave fica só no servidor. NÃO testado contra a API real nesta entrega
 * (sem credencial no ambiente de desenvolvimento) — valide em homologação e confira cotas/custos/termos no Google Cloud.
 */
export async function searchPlaces(niche: string, city: string, max = 20, pages = 1): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY não configurada (integração pendente)');
  const out: PlaceResult[] = []; let token: string | undefined;
  for (let i = 0; i < Math.max(1, Math.min(pages, 3)); i++) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': `${placesExtended() ? FIELDS_EXTENDED : FIELDS},nextPageToken` },
      body: JSON.stringify({ textQuery: `${niche} em ${city}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: Math.min(Math.max(max, 1), 20), ...(token ? { pageToken: token } : {}) }),
    });
    if (!res.ok) throw new Error(`Google Places respondeu ${res.status}`);
    const json = (await res.json()) as { nextPageToken?: string };
    out.push(...mapPlaces(json, placesExtended()));
    token = json.nextPageToken; if (!token) break;
  }
  return out;
}
