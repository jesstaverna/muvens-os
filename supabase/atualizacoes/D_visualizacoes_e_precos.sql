-- MUVENS OS — 0013 Visualizações da landing do diagnóstico + preços de referência ("a partir de")
alter table public.prospects
  add column report_views int not null default 0,
  add column report_first_viewed_at timestamptz,
  add column report_last_viewed_at timestamptz;

create table public.service_prices (
  service text primary key,
  price_from numeric(12,2) not null check (price_from > 0),
  unit text not null default 'unico' check (unit in ('unico','mensal')),
  updated_at timestamptz not null default now()
);
create trigger trg_service_prices_touch before update on public.service_prices for each row execute function app.touch_updated_at();
alter table public.service_prices enable row level security;
grant select, insert, update, delete on public.service_prices to authenticated;
grant all on public.service_prices to service_role;
revoke all on public.service_prices from anon;
create policy prices_select on public.service_prices for select to authenticated using (app.has_role('admin','comercial'));
create policy prices_write on public.service_prices for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- Diagnóstico público passa a incluir os preços de referência cadastrados (serviço sem preço = "sob consulta").
create or replace function public.public_prospect_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'category', p.category, 'website', p.website, 'rating', p.rating, 'reviews_count', p.reviews_count,
    'score', p.score, 'recommended_service', p.recommended_service, 'analyzed_at', p.analyzed_at,
    'site', p.analysis->'site', 'observations', coalesce(p.analysis->'observations', '[]'::jsonb),
    'prices', coalesce((select jsonb_object_agg(s.service, jsonb_build_object('from', s.price_from, 'unit', s.unit)) from public.service_prices s), '{}'::jsonb))
  from public.prospects p
  where p.report_token = p_token and p.analyzed_at is not null and p.analysis is not null and p.status <> 'descartado'
$$;

-- Registra a visualização da landing (chamada pelo servidor, sem login). Avisa a equipe na primeira abertura.
create or replace function public.record_report_view(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.prospects;
begin
  select * into p from public.prospects where report_token = p_token and analyzed_at is not null and status <> 'descartado';
  if not found then return false; end if;
  update public.prospects set report_views = report_views + 1, report_last_viewed_at = now(), report_first_viewed_at = coalesce(report_first_viewed_at, now()) where id = p.id;
  if p.report_first_viewed_at is null then
    perform app.notify('Abriram o diagnóstico: ' || p.name, 'O prospecto abriu a landing do diagnóstico pela primeira vez. Bom momento para entrar em contato (pode ser também um leitor automático de e-mail).', '/prospeccao/' || p.id, 'info', case when p.created_by is null then 'comercial' end, p.created_by, 'report_view:' || p.id);
  end if;
  return true;
end $$;
revoke execute on function public.record_report_view(text) from public;
grant execute on function public.record_report_view(text) to anon, authenticated;
