import type { SupabaseClient } from '@supabase/supabase-js';
import { placesConfigured, searchPlaces } from '@/integrations/google-places';
import type { PlaceResult } from './places-map';

/** Grava resultados do Google Maps como prospectos (ignora duplicados por local, e-mail ou domínio). */
export async function insertPlaces(db: SupabaseClient, campaignId: string, places: PlaceResult[]) {
  let created = 0, dup = 0; const ids: string[] = [];
  for (const p of places) {
    const { data, error } = await db.from('prospects').insert({ campaign_id: campaignId, source: 'google_maps', place_id: p.place_id, name: p.name, category: p.category, address: p.address, phone: p.phone, website: p.website, rating: p.rating, reviews_count: p.reviews_count, maps_url: p.maps_url, google_fetched_at: new Date().toISOString(), ...(p.details ? { google_details: p.details } : {}) }).select('id').single();
    if (error) {
      if (error.code === '23505') { dup++; if (p.details) await db.from('prospects').update({ google_details: p.details, rating: p.rating, reviews_count: p.reviews_count }).eq('place_id', p.place_id); }   // reaproveita a busca para atualizar fotos, horários e avaliações
      continue;
    }
    created++; ids.push(data!.id);
  }
  return { created, dup, ids };
}

/** Repete, uma vez por semana, a busca das campanhas marcadas como recorrentes. Até 3 páginas (60 resultados) por campanha e 3 campanhas por execução. A análise dos novos é feita pelo mesmo worker. */
export async function runRecurringCampaigns(db: SupabaseClient, now = new Date(), opts: { force?: boolean } = {}) {
  if (!placesConfigured()) return { campaigns: 0, created: 0, skipped: 'Google Places não configurado' };
  const cutoff = new Date(now.getTime() - 7 * 86400_000).toISOString();
  let q = db.from('prospect_campaigns').select('id, niche, city, max_results').eq('status', 'ativa').eq('auto_weekly', true);
  if (!opts.force) q = q.or(`last_auto_run_at.is.null,last_auto_run_at.lt.${cutoff}`);
  const { data: cs, error } = await q.order('last_auto_run_at', { ascending: true, nullsFirst: true }).limit(3);
  if (error) throw new Error(error.message);
  let created = 0, done = 0;
  for (const c of cs ?? []) {
    try {
      const places = await searchPlaces(c.niche, c.city, c.max_results, 3);
      created += (await insertPlaces(db, c.id, places)).created; done++;
      await db.from('prospect_campaigns').update({ last_auto_run_at: new Date().toISOString() }).eq('id', c.id);
    } catch { /* tenta de novo na próxima execução; o carimbo só é gravado em caso de sucesso */ }
  }
  return { campaigns: done, created };
}
