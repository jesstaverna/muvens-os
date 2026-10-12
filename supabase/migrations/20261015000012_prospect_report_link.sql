-- MUVENS OS — 0012 Link público do diagnóstico do prospecto (sem login, por token difícil de adivinhar)
alter table public.prospects add column report_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update public.prospects set report_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where report_token is null;
alter table public.prospects alter column report_token set not null;

-- Devolve apenas dados da análise pública (nunca e-mail, telefone, notas ou histórico). Nulo se não existir, não foi analisado ou foi descartado/descadastrado.
create or replace function public.public_prospect_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'category', p.category, 'website', p.website, 'rating', p.rating, 'reviews_count', p.reviews_count,
    'score', p.score, 'recommended_service', p.recommended_service, 'analyzed_at', p.analyzed_at,
    'site', p.analysis->'site', 'observations', coalesce(p.analysis->'observations', '[]'::jsonb))
  from public.prospects p
  where p.report_token = p_token and p.analyzed_at is not null and p.analysis is not null and p.status <> 'descartado'
$$;
revoke execute on function public.public_prospect_report(text) from public;
grant execute on function public.public_prospect_report(text) to anon, authenticated;
