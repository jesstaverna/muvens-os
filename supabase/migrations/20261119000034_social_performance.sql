-- Performance social da Muvens: métricas informadas e validadas, sem dados simulados.
create table if not exists public.social_period_metrics (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 platform text not null check (platform in ('instagram','facebook','linkedin')),
 period_start date not null,
 period_end date not null,
 reach bigint not null default 0 check (reach>=0),
 impressions bigint not null default 0 check (impressions>=0),
 engagements bigint not null default 0 check (engagements>=0),
 profile_visits bigint not null default 0 check (profile_visits>=0),
 link_clicks bigint not null default 0 check (link_clicks>=0),
 followers bigint check (followers is null or followers>=0),
 source text not null default 'manual' check (source in ('manual','importacao','api')),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (period_end>=period_start),
 unique (client_id,platform,period_start,period_end)
);
create index if not exists social_period_metrics_dates_idx on public.social_period_metrics(client_id,period_start desc);
alter table public.social_period_metrics enable row level security;
grant select,insert,update,delete on public.social_period_metrics to authenticated;
revoke all on public.social_period_metrics from anon;
drop policy if exists social_period_metrics_staff on public.social_period_metrics;
create policy social_period_metrics_staff on public.social_period_metrics for all to authenticated
 using (app.has_role('admin','comercial','trafego'))
 with check (app.has_role('admin','comercial','trafego'));

create table if not exists public.social_post_metrics (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 platform text not null check (platform in ('instagram','facebook','linkedin')),
 post_title text not null check (char_length(post_title) between 3 and 220),
 published_on date not null,
 post_url text,
 reach bigint not null default 0 check (reach>=0),
 views bigint not null default 0 check (views>=0),
 interactions bigint not null default 0 check (interactions>=0),
 likes bigint not null default 0 check (likes>=0),
 comments bigint not null default 0 check (comments>=0),
 shares bigint not null default 0 check (shares>=0),
 saves bigint not null default 0 check (saves>=0),
 source text not null default 'manual' check (source in ('manual','importacao','api')),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists social_post_metrics_performance_idx on public.social_post_metrics(client_id,published_on desc,reach desc);
alter table public.social_post_metrics enable row level security;
grant select,insert,update,delete on public.social_post_metrics to authenticated;
revoke all on public.social_post_metrics from anon;
drop policy if exists social_post_metrics_staff on public.social_post_metrics;
create policy social_post_metrics_staff on public.social_post_metrics for all to authenticated
 using (app.has_role('admin','comercial','trafego'))
 with check (app.has_role('admin','comercial','trafego'));
