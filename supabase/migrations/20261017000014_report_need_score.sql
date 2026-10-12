-- MUVENS OS — 0014 A landing pública mostra a pontuação de NECESSIDADE (sem o bônus interno de contato).
create or replace function public.public_prospect_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'category', p.category, 'website', p.website, 'rating', p.rating, 'reviews_count', p.reviews_count,
    'score', coalesce((p.analysis->>'need_score')::int, p.score), 'recommended_service', p.recommended_service, 'analyzed_at', p.analyzed_at,
    'site', p.analysis->'site', 'observations', coalesce(p.analysis->'observations', '[]'::jsonb),
    'prices', coalesce((select jsonb_object_agg(s.service, jsonb_build_object('from', s.price_from, 'unit', s.unit)) from public.service_prices s), '{}'::jsonb))
  from public.prospects p
  where p.report_token = p_token and p.analyzed_at is not null and p.analysis is not null and p.status <> 'descartado'
$$;
