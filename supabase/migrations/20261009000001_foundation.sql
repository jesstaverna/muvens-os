-- MUVENS OS — 0001 Fundação: perfis, papéis, helpers, auditoria, fila de jobs, notificações
-- Convenções: texto + CHECK no lugar de ENUM (evolução mais simples); datas de negócio em America/Sao_Paulo.

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------- helpers genéricos ----------
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function app.br_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'America/Sao_Paulo')::date $$;

create or replace function app.norm_phone(p text) returns text language sql immutable as $$
  select case
    when p is null then null
    else nullif(
      case
        when length(regexp_replace(p, '\D', '', 'g')) in (12, 13) and regexp_replace(p, '\D', '', 'g') like '55%'
          then substr(regexp_replace(p, '\D', '', 'g'), 3)
        else regexp_replace(p, '\D', '', 'g')
      end, '')
  end
$$;

create or replace function app.norm_email(e text) returns text language sql immutable as $$
  select nullif(lower(btrim(e)), '')
$$;

-- ---------- perfis ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        text not null default 'cliente'
              check (role in ('admin','comercial','financeiro','designer','trafego','cliente')),
  client_id   uuid,                         -- FK adicionada na 0003 (usuários do portal do cliente)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create or replace function app.user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function app.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.user_role() = any (roles), false)
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.user_role() in ('admin','comercial','financeiro','designer','trafego'), false)
$$;

create or replace function app.current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and active and role = 'cliente'
$$;

-- Primeiro usuário vira admin; os demais entram como 'cliente' SEM client_id (sem acesso a nada)
-- até um admin atribuir o papel. Recomenda-se desativar signup público no Supabase.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7000001);
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'cliente' else 'admin' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Impede escalada de privilégio: só admin (ou service role / SQL direto) altera papel, vínculo e ativação.
create or replace function app.guard_profile() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and not app.has_role('admin') then
    if new.role is distinct from old.role
       or new.client_id is distinct from old.client_id
       or new.active is distinct from old.active
       or new.id is distinct from old.id then
      raise exception 'Apenas administradores podem alterar papel, vínculo ou status do usuário' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function app.guard_profile();

-- ---------- auditoria ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  actor_id    uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := to_jsonb(coalesce(new, old));
  insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
  values (tg_table_name, rec->>'id', tg_op, auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger trg_profiles_audit after insert or update or delete on public.profiles
  for each row execute function app.audit();

-- ---------- fila de jobs (automações 24/7) ----------
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending','running','done','failed','dead')),
  attempts      int  not null default 0,
  max_attempts  int  not null default 5,
  run_at        timestamptz not null default now(),
  locked_at     timestamptz,
  finished_at   timestamptz,
  last_error    text,
  dedupe_key    text,
  created_at    timestamptz not null default now()
);
create unique index jobs_dedupe_idx on public.jobs (dedupe_key) where dedupe_key is not null and status in ('pending','running');
create index jobs_claim_idx on public.jobs (run_at) where status in ('pending','failed');

-- Reivindica jobs de forma atômica (vários workers concorrentes sem duplicar). Também recupera
-- jobs "running" travados há mais de 10 minutos (worker caiu no meio).
create or replace function public.claim_jobs(p_limit int default 10) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with next as (
    select id from public.jobs
    where (status in ('pending','failed') and run_at <= now())
       or (status = 'running' and locked_at < now() - interval '10 minutes')
    order by run_at
    limit p_limit
    for update skip locked
  )
  update public.jobs j
     set status = 'running', locked_at = now(), attempts = j.attempts + 1
    from next where j.id = next.id
  returning j.*;
end $$;

create or replace function public.finish_job(p_id uuid, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_error is null then
    update public.jobs set status = 'done', finished_at = now(), last_error = null, locked_at = null where id = p_id;
  else
    update public.jobs
       set last_error = left(p_error, 2000), locked_at = null,
           status = case when attempts >= max_attempts then 'dead' else 'failed' end,
           finished_at = case when attempts >= max_attempts then now() end,
           -- backoff exponencial: 1, 2, 4, 8... minutos
           run_at = now() + (power(2, greatest(attempts - 1, 0)) || ' minutes')::interval
     where id = p_id;
  end if;
end $$;

-- Enfileira se não existir job equivalente pendente (idempotente).
create or replace function app.enqueue_job(p_type text, p_payload jsonb default '{}', p_run_at timestamptz default now(), p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.jobs (type, payload, run_at, dedupe_key) values (p_type, p_payload, p_run_at, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('pending','running') do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------- notificações / alertas ----------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,  -- null = todos da equipe
  audience    text check (audience in ('admin','comercial','financeiro','designer','trafego')), -- null = qualquer staff
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  title       text not null,
  body        text,
  link        text,
  dedupe_key  text unique,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function app.notify(p_title text, p_body text, p_link text, p_severity text default 'info',
                                      p_audience text default null, p_user uuid default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (title, body, link, severity, audience, user_id, dedupe_key)
  values (p_title, p_body, p_link, p_severity, p_audience, p_user, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;
