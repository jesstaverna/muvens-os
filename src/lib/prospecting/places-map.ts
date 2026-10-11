export interface PlaceResult { place_id: string; name: string; category: string | null; address: string | null; phone: string | null; website: string | null; rating: number | null; reviews_count: number | null; maps_url: string | null }

export const FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri', 'places.primaryTypeDisplayName'].join(',');

/** Converte a resposta da Places API (New) — Text Search — no nosso formato. */
export function mapPlaces(json: unknown): PlaceResult[] {
  const places = (json as { places?: Record<string, any>[] })?.places ?? [];
  return places.filter((p) => p?.id && p?.displayName?.text).map((p) => ({
    place_id: String(p.id), name: String(p.displayName.text), category: p.primaryTypeDisplayName?.text ?? null, address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null, rating: typeof p.rating === 'number' ? p.rating : null,
    reviews_count: typeof p.userRatingCount === 'number' ? p.userRatingCount : null, maps_url: p.googleMapsUri ?? null,
  }));
}

