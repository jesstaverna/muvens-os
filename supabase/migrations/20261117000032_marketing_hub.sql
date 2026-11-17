-- Central de Marketing: planejamento interno e por cliente, sem integração automática com provedores de anúncios.
-- Objetos adicionais: não altera leads, contratos, projetos nem dados da prospecção.
create table if not exists public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 160),
  client_id uuid references public.clients(id) on delete set null,
  scope text not null default 'interno' check (scope in ('interno','cliente')),
  status text not null default 'planejado' check (status in ('rascunho','planejado','ativo','pausado','concluido')),
  objective text not null default '',
  offer text not null default '',
  audience text not null default '',
  region text not null default '',
  landing_url text,
  channels text[] not null default array['instagram','facebook']::text[],
  monthly_budget_min numeric(12,2) not null default 0 check (monthly_budget_min >= 0),
  monthly_budget_max numeric(12,2) not null default 0 check (monthly_budget_max >= monthly_budget_min),
  primary_kpi text not null default 'Leads qualificados',
  strategy text not null default '',
  measurement text not null default '',
  start_on date,
  end_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_dates_valid check (end_on is null or start_on is null or end_on >= start_on)
);

create index if not exists marketing_plans_client_idx on public.marketing_plans(client_id,created_at desc);
create index if not exists marketing_plans_status_idx on public.marketing_plans(status,updated_at desc);

create table if not exists public.marketing_activities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.marketing_plans(id) on delete cascade,
  kind text not null check (kind in ('campanha','publico','criativo','conteudo','checklist')),
  title text not null check (length(trim(title)) between 2 and 180),
  channel text not null default 'instagram_facebook',
  status text not null default 'ideia' check (status in ('ideia','planejado','em_producao','em_revisao','aprovado','ativo','pausado','concluido')),
  description text not null default '',
  cta text,
  destination_url text,
  format text,
  planned_on date,
  monthly_budget numeric(12,2) check (monthly_budget is null or monthly_budget >= 0),
  utm_campaign text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_activities_plan_idx on public.marketing_activities(plan_id,kind,created_at);
create index if not exists marketing_activities_due_idx on public.marketing_activities(planned_on) where planned_on is not null;

alter table public.marketing_plans enable row level security;
alter table public.marketing_activities enable row level security;

-- SELECT exige ser membro ativo da equipe; cliente do portal nunca vê planejamento interno.
do $ddl$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='marketing_plans' and policyname='marketing_plans_read') then
    create policy marketing_plans_read on public.marketing_plans for select to authenticated using (
      app.has_role(variadic array['admin','comercial','designer','trafego']::text[])
    );
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='marketing_plans' and policyname='marketing_plans_insert') then
    create policy marketing_plans_insert on public.marketing_plans for insert to authenticated with check (
      app.has_role(variadic array['admin','comercial','trafego']::text[])
    );
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='marketing_plans' and policyname='marketing_plans_update') then
    create policy marketing_plans_update on public.marketing_plans for update to authenticated using (
      app.has_role(variadic array['admin','comercial','trafego']::text[])
    ) with check (
      app.has_role(variadic array['admin','comercial','trafego']::text[])
    );
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='marketing_activities' and policyname='marketing_activities_read') then
    create policy marketing_activities_read on public.marketing_activities for select to authenticated using (
      app.has_role(variadic array['admin','comercial','designer','trafego']::text[])
    );
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='marketing_activities' and policyname='marketing_activities_insert') then
    create policy marketing_activities_insert on public.marketing_activities for insert to authenticated with check (
      app.has_role(variadic array['admin','comercial','designer','trafego']::text[])
    );
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='marketing_activities' and policyname='marketing_activities_update') then
    create policy marketing_activities_update on public.marketing_activities for update to authenticated using (
      app.has_role(variadic array['admin','comercial','designer','trafego']::text[])
    ) with check (
      app.has_role(variadic array['admin','comercial','designer','trafego']::text[])
    );
  end if;
end $ddl$;

revoke all on public.marketing_plans,public.marketing_activities from anon;
grant select,insert,update on public.marketing_plans,public.marketing_activities to authenticated;
grant all on public.marketing_plans,public.marketing_activities to service_role;

comment on table public.marketing_plans is 'Plano estratégico e de mídia. Orçamento planejado, sem faturamento nem automação de anúncios.';
comment on table public.marketing_activities is 'Campanhas, públicos, criativos, conteúdos e checklists associados ao plano de marketing.';
