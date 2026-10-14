-- MUVENS OS — 0023 Serviço Google Meu Negócio (propostas, contratos) e dados do perfil no diagnóstico público
alter table public.proposals drop constraint if exists proposals_template_check;
alter table public.proposals add constraint proposals_template_check
  check (template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','rd_marketing','rd_conversas','automacao','ia_aplicada','google_meu_negocio','personalizado'));
alter table public.contract_templates drop constraint if exists contract_templates_service_template_check;
alter table public.contract_templates add constraint contract_templates_service_template_check
  check (service_template in ('redes_sociais','branding','site_institucional','landing_page','trafego_pago','design_recorrente','design_posts','consultoria','rd_marketing','rd_conversas','automacao','ia_aplicada','google_meu_negocio','personalizado'));

insert into public.contract_templates (service_template, name, body)
select 'google_meu_negocio', 'Modelo padrão', (select body from public.contract_templates where service_template = 'personalizado' order by name limit 1)
on conflict (service_template, name) do nothing;

-- O diagnóstico público passa a informar se o prospecto veio do Google Maps e se há telefone no perfil (sem expor o número).
create or replace function public.public_prospect_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'category', p.category, 'website', p.website, 'rating', p.rating, 'reviews_count', p.reviews_count,
    'score', coalesce((p.analysis->>'need_score')::int, p.score), 'recommended_service', p.recommended_service, 'analyzed_at', p.analyzed_at,
    'site', p.analysis->'site', 'observations', coalesce(p.analysis->'observations', '[]'::jsonb),
    'from_google', (p.source = 'google_maps'), 'has_phone', (p.phone is not null and btrim(p.phone) <> ''),
    'prices', coalesce((select jsonb_object_agg(s.service, jsonb_build_object('from', s.price_from, 'unit', s.unit)) from public.service_prices s), '{}'::jsonb))
  from public.prospects p
  where p.report_token = p_token and p.analyzed_at is not null and p.analysis is not null and p.status <> 'descartado'
$$;
