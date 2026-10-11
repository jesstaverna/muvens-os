-- MUVENS OS — atualização única. Cole TUDO no SQL Editor do Supabase e clique em Run. Rode UMA vez.

-- ======== 20261011000008_projects.sql ========
-- MUVENS OS — Fase 2 / Projetos, tarefas, entregáveis, horas, aprovação, onboarding

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  name        text not null,
  status      text not null default 'planejamento' check (status in ('planejamento','em_andamento','pausado','concluido','cancelado')),
  starts_on   date, due_on date,
  owner_id    uuid references public.profiles(id) on delete set null,
  notes       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);
create unique index projects_contract_uidx on public.projects (contract_id) where contract_id is not null;
create trigger trg_projects_touch before update on public.projects for each row execute function app.touch_updated_at();
create trigger trg_projects_audit after insert or update or delete on public.projects for each row execute function app.audit();

-- Entregáveis contratados (ex.: 12 posts em 2026-11)
create table public.deliverable_plans (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  name         text not null,
  period_month date not null check (extract(day from period_month) = 1),
  quantity     int not null check (quantity > 0),
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (client_id, name, period_month)
);

create table public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  deliverable_plan_id  uuid references public.deliverable_plans(id) on delete set null,
  title                text not null,
  briefing             text,
  assignee_id          uuid references public.profiles(id) on delete set null,
  due_on               date,
  priority             text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  status               text not null default 'a_fazer' check (status in ('a_fazer','em_andamento','produzido','enviado','ajustes','aprovado','entregue','cancelada')),
  out_of_scope         boolean not null default false,
  out_of_scope_note    text,
  completed_at         timestamptz,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id) where status not in ('entregue','cancelada');
create index tasks_due_idx on public.tasks (due_on) where status not in ('entregue','cancelada');
create index tasks_plan_idx on public.tasks (deliverable_plan_id);
create trigger trg_tasks_touch before update on public.tasks for each row execute function app.touch_updated_at();

create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null, detail text, actor_id uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at desc);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  text text not null, done boolean not null default false, position int not null default 0
);
create index task_checklist_task_idx on public.task_checklist_items (task_id, position);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id), body text not null check (length(btrim(body)) > 0), created_at timestamptz not null default now()
);
create table public.task_files (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  path text not null, name text not null, size bigint, uploaded_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create table public.time_entries (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  minutes int not null check (minutes > 0 and minutes <= 1440), worked_on date not null default current_date, note text, created_at timestamptz not null default now()
);
create index time_entries_task_idx on public.time_entries (task_id);
create index time_entries_day_idx on public.time_entries (worked_on);
-- custo/hora: dado sensível, tabela própria (só admin/financeiro)
create table public.staff_rates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_cost numeric(10,2) not null check (hourly_cost >= 0), updated_at timestamptz not null default now()
);

-- ---------- regras ----------
create or replace function app.tasks_before() returns trigger language plpgsql as $$
declare v_qty int; v_used int;
begin
  if tg_op = 'INSERT' then
    -- passou do contratado → serviço fora do escopo (marcado automaticamente; pode ser ajustado pela equipe)
    if new.deliverable_plan_id is not null and not new.out_of_scope then
      select quantity into v_qty from public.deliverable_plans where id = new.deliverable_plan_id;
      select count(*) into v_used from public.tasks where deliverable_plan_id = new.deliverable_plan_id and not out_of_scope and status <> 'cancelada';
      if v_used >= v_qty then
        new.out_of_scope := true;
        new.out_of_scope_note := coalesce(new.out_of_scope_note, 'Excede a quantidade contratada (' || v_qty || ') — orçar à parte');
      end if;
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'enviado' and old.status not in ('produzido','ajustes') then raise exception 'Só é possível enviar ao cliente uma peça já produzida' using errcode = '23514'; end if;
    if new.status = 'ajustes' and old.status <> 'enviado' then raise exception 'Ajustes só podem ser pedidos sobre uma peça enviada ao cliente' using errcode = '23514'; end if;
    if new.status = 'aprovado' and old.status <> 'enviado' then raise exception 'Só é possível aprovar uma peça enviada ao cliente' using errcode = '23514'; end if;
    if new.status = 'entregue' and old.status <> 'aprovado' then raise exception 'Só é possível entregar uma peça aprovada' using errcode = '23514'; end if;
    if old.status in ('entregue','cancelada') and current_user in ('authenticated','anon') and not app.has_role('admin') then
      raise exception 'Apenas administradores reabrem tarefas entregues/canceladas' using errcode = '42501';
    end if;
    new.completed_at := case when new.status = 'entregue' then now() end;
  end if;
  return new;
end $$;
create trigger trg_tasks_before before insert or update on public.tasks for each row execute function app.tasks_before();

create or replace function app.tasks_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'criada', new.title, auth.uid());
    if new.out_of_scope then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'fora_escopo', new.out_of_scope_note, auth.uid()); end if;
  else
    if new.status is distinct from old.status then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'status', old.status || ' → ' || new.status, auth.uid()); end if;
    if new.assignee_id is distinct from old.assignee_id then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'responsavel', coalesce((select full_name from public.profiles where id = new.assignee_id), 'sem responsável'), auth.uid()); end if;
    if new.due_on is distinct from old.due_on then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'prazo', coalesce(to_char(old.due_on, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(new.due_on, 'DD/MM/YYYY'), '—'), auth.uid()); end if;
    if new.priority is distinct from old.priority then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'prioridade', old.priority || ' → ' || new.priority, auth.uid()); end if;
    if new.out_of_scope is distinct from old.out_of_scope then insert into public.task_events (task_id, kind, detail, actor_id) values (new.id, 'fora_escopo', case when new.out_of_scope then 'Marcada como fora do escopo' else 'Voltou ao escopo' end, auth.uid()); end if;
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null and new.assignee_id is distinct from auth.uid() then
      perform app.notify('Tarefa atribuída a você', new.title, '/projetos/tarefas/' || new.id, 'info', null, new.assignee_id, 'task.assigned:' || new.id || ':' || new.assignee_id);
    end if;
  end if;
  return null;
end $$;
create trigger trg_tasks_after after insert or update on public.tasks for each row execute function app.tasks_after();

-- Progresso dos entregáveis contratados (apenas tarefas dentro do escopo; fora do escopo contadas à parte)
create view public.deliverable_progress with (security_invoker = true) as
select p.id, p.client_id, p.project_id, p.name, p.period_month, p.quantity,
  count(t.id) filter (where not t.out_of_scope and t.status in ('em_andamento','produzido','enviado','ajustes','aprovado','entregue')) as iniciados,
  count(t.id) filter (where not t.out_of_scope and t.status in ('produzido','enviado','ajustes','aprovado','entregue')) as produzidos,
  count(t.id) filter (where not t.out_of_scope and t.status in ('enviado','ajustes','aprovado','entregue')) as enviados,
  count(t.id) filter (where not t.out_of_scope and t.status in ('aprovado','entregue')) as aprovados,
  count(t.id) filter (where not t.out_of_scope and t.status = 'entregue') as entregues,
  count(t.id) filter (where t.out_of_scope and t.status <> 'cancelada') as fora_escopo
from public.deliverable_plans p left join public.tasks t on t.deliverable_plan_id = p.id
group by p.id;

-- Onboarding automático ao assinar o contrato (tarefas genéricas; sem prazos nem promessas)
create or replace function app.create_onboarding(p_contract uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare c public.contracts; v_proj uuid; v_name text; i int; v_titles text[] := array['Reunião de kickoff com o cliente','Coletar acessos e materiais da marca','Enviar briefing inicial ao cliente','Definir calendário de produção do 1º mês'];
begin
  select * into c from public.contracts where id = p_contract;
  if c.client_id is null then return null; end if;
  select id into v_proj from public.projects where contract_id = c.id;
  if v_proj is not null then return v_proj; end if;
  select name into v_name from public.clients where id = c.client_id;
  insert into public.projects (client_id, contract_id, name, status, starts_on, notes) values (c.client_id, c.id, 'Onboarding — ' || v_name, 'em_andamento', c.starts_on, 'Criado automaticamente pela assinatura do contrato #' || c.number) returning id into v_proj;
  for i in 1..array_length(v_titles, 1) loop insert into public.tasks (project_id, title, priority) values (v_proj, v_titles[i], 'alta'); end loop;
  perform app.notify('Onboarding criado: ' || v_name, 'Projeto inicial com 4 tarefas. Defina responsáveis e prazos.', '/projetos/' || v_proj, 'info', null, null, 'onboarding:' || v_proj);
  return v_proj;
end $$;
create or replace function app.contracts_onboarding() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'assinado' and old.status is distinct from 'assinado' then perform app.create_onboarding(new.id); end if;
  return null;
end $$;
create trigger trg_contracts_onboarding after update on public.contracts for each row execute function app.contracts_onboarding();

-- Alertas de atraso (chamado pelo worker)
create or replace function public.run_project_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; today date := app.br_date(now());
begin
  for r in select t.id, t.title, t.assignee_id, t.due_on, p.name as pname from public.tasks t join public.projects p on p.id = t.project_id
           where t.due_on < today and t.status in ('a_fazer','em_andamento','produzido','ajustes') and p.status not in ('cancelado','concluido') loop
    perform app.notify('Tarefa atrasada: ' || r.title, r.pname || ' — prazo ' || to_char(r.due_on, 'DD/MM/YYYY'), '/projetos/tarefas/' || r.id, 'warning',
                       case when r.assignee_id is null then 'admin' end, r.assignee_id, 'task.late:' || r.id || ':' || to_char(today, 'IYYY-IW'));
    n := n + 1;
  end loop;
  return jsonb_build_object('late_tasks', n);
end $$;

-- Rentabilidade por cliente (receita recebida − horas × custo/hora). Só admin/financeiro.
create or replace function public.client_profitability(p_from date, p_to date)
returns table (client_id uuid, client_name text, received numeric, minutes bigint, minutes_without_rate bigint, labor_cost numeric, margin numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_role('admin','financeiro') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query
  with rec as (select f.client_id, sum(f.paid_amount) as v from public.fin_transactions f where f.direction = 'in' and f.status = 'liquidado' and app.br_date(f.paid_at) between p_from and p_to and f.client_id is not null group by 1),
       lab as (select pr.client_id, sum(te.minutes) as m, sum(te.minutes) filter (where sr.user_id is null) as m_nr, sum(te.minutes / 60.0 * coalesce(sr.hourly_cost, 0)) as cost
               from public.time_entries te join public.tasks t on t.id = te.task_id join public.projects pr on pr.id = t.project_id left join public.staff_rates sr on sr.user_id = te.user_id
               where te.worked_on between p_from and p_to group by 1)
  select c.id, c.name, coalesce(rec.v, 0), coalesce(lab.m, 0)::bigint, coalesce(lab.m_nr, 0)::bigint, round(coalesce(lab.cost, 0), 2), round(coalesce(rec.v, 0) - coalesce(lab.cost, 0), 2)
  from public.clients c left join rec on rec.client_id = c.id left join lab on lab.client_id = c.id
  where rec.v is not null or lab.m is not null order by 7 desc;
end $$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['projects','deliverable_plans','tasks','task_events','task_checklist_items','task_comments','task_files','time_entries','staff_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant select on public.deliverable_progress to authenticated;
grant all on public.deliverable_progress to service_role;
revoke all on public.deliverable_progress from anon;
grant usage on all sequences in schema public to authenticated, service_role;

create policy projects_select on public.projects for select to authenticated using (app.is_staff());
create policy projects_write on public.projects for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy plans_select on public.deliverable_plans for select to authenticated using (app.is_staff());
create policy plans_write on public.deliverable_plans for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy tasks_select on public.tasks for select to authenticated using (app.is_staff());
create policy tasks_write on public.tasks for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy tevents_select on public.task_events for select to authenticated using (app.is_staff());
create policy checklist_select on public.task_checklist_items for select to authenticated using (app.is_staff());
create policy checklist_write on public.task_checklist_items for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy tcomments_select on public.task_comments for select to authenticated using (app.is_staff());
create policy tcomments_insert on public.task_comments for insert to authenticated with check (app.has_role('admin','comercial','designer','trafego') and author_id = auth.uid());
create policy tcomments_delete on public.task_comments for delete to authenticated using (author_id = auth.uid() or app.has_role('admin'));
create policy tfiles_select on public.task_files for select to authenticated using (app.is_staff());
create policy tfiles_write on public.task_files for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));
create policy time_select on public.time_entries for select to authenticated using (app.is_staff());
create policy time_insert on public.time_entries for insert to authenticated with check (app.has_role('admin','comercial','designer','trafego') and user_id = auth.uid());
create policy time_modify on public.time_entries for update to authenticated using (user_id = auth.uid() or app.has_role('admin')) with check (user_id = auth.uid() or app.has_role('admin'));
create policy time_delete on public.time_entries for delete to authenticated using (user_id = auth.uid() or app.has_role('admin'));
create policy rates_all on public.staff_rates for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));

revoke execute on function public.run_project_scans(), public.client_profitability(date, date) from public, anon;
grant execute on function public.run_project_scans() to service_role;
grant execute on function public.client_profitability(date, date) to authenticated;
revoke execute on function app.create_onboarding(uuid) from public, anon, authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('task-files', 'task-files', false) on conflict (id) do nothing;
    execute $p$create policy "task files read" on storage.objects for select to authenticated using (bucket_id = 'task-files' and app.is_staff())$p$;
    execute $p$create policy "task files write" on storage.objects for insert to authenticated with check (bucket_id = 'task-files' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "task files delete" on storage.objects for delete to authenticated using (bucket_id = 'task-files' and app.has_role('admin','comercial','designer','trafego'))$p$;
  end if;
end $$;

-- ======== 20261012000009_brand_center.sql ========
-- MUVENS OS — Fase 2 / Brand Center (identidade visual por cliente) e base de conhecimento para a IA

create table public.brand_profiles (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  tone_of_voice    text,
  design_rules     text,
  restrictions     text,          -- restrições de aplicação (o que NÃO fazer)
  ai_instructions  text,          -- instruções específicas para a IA/briefings desta marca
  updated_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);
create table public.brand_colors (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, hex text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null default 'primaria' check (role in ('primaria','secundaria','apoio','neutra')),
  position int not null default 0
);
create index brand_colors_client_idx on public.brand_colors (client_id, position);
create table public.brand_fonts (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, usage text not null default 'texto' check (usage in ('titulo','texto','destaque')), source_url text,
  position int not null default 0
);
create index brand_fonts_client_idx on public.brand_fonts (client_id);
create table public.brand_links (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null default 'outro' check (kind in ('figma','drive','outro')), label text not null,
  url text not null check (url ~* '^https?://')
);
create index brand_links_client_idx on public.brand_links (client_id);
create table public.brand_assets (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('logo','variacao','kv','brandbook','foto','elemento','template','referencia','editavel','outro')),
  name text not null, description text, tags text[] not null default '{}',
  path text not null unique, size bigint, mime text,
  downloadable boolean not null default true,     -- false = só administrador baixa (download autorizado)
  uploaded_by uuid default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create index brand_assets_client_idx on public.brand_assets (client_id, category);
create index brand_assets_search_idx on public.brand_assets (lower(name));

create trigger trg_brand_profiles_audit after insert or update or delete on public.brand_profiles for each row execute function app.audit();
create or replace function app.brand_profiles_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
create trigger trg_brand_profiles_touch before insert or update on public.brand_profiles for each row execute function app.brand_profiles_touch();
create trigger trg_brand_assets_audit after insert or update or delete on public.brand_assets for each row execute function app.audit();

-- Base de conhecimento da marca para a IA (Fase 4): regras criativas + paleta + tipografia + links + inventário de arquivos.
-- security invoker: respeita a permissão de quem consulta.
create or replace function public.brand_knowledge(p_client uuid) returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'client', (select name from public.clients where id = p_client),
    'tone_of_voice', (select tone_of_voice from public.brand_profiles where client_id = p_client),
    'design_rules', (select design_rules from public.brand_profiles where client_id = p_client),
    'restrictions', (select restrictions from public.brand_profiles where client_id = p_client),
    'ai_instructions', (select ai_instructions from public.brand_profiles where client_id = p_client),
    'colors', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'hex', hex, 'role', role) order by position) from public.brand_colors where client_id = p_client), '[]'::jsonb),
    'fonts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'usage', usage) order by position) from public.brand_fonts where client_id = p_client), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'url', url)) from public.brand_links where client_id = p_client), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'name', name, 'description', description, 'tags', tags)) from public.brand_assets where client_id = p_client), '[]'::jsonb))
$$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['brand_profiles','brand_colors','brand_fonts','brand_links','brand_assets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_role(''admin'',''comercial'',''designer'',''trafego''))', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.has_role(''admin'',''comercial'',''designer'')) with check (app.has_role(''admin'',''comercial'',''designer''))', t || '_write', t);
  end loop;
end $$;
revoke execute on function public.brand_knowledge(uuid) from public, anon;
grant execute on function public.brand_knowledge(uuid) to authenticated, service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('brand-assets', 'brand-assets', false, 52428800) on conflict (id) do nothing;
    execute $p$create policy "brand assets read" on storage.objects for select to authenticated using (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "brand assets write" on storage.objects for insert to authenticated with check (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer'))$p$;
    execute $p$create policy "brand assets delete" on storage.objects for delete to authenticated using (bucket_id = 'brand-assets' and app.has_role('admin','comercial','designer'))$p$;
  end if;
end $$;

-- ======== 20261013000010_client_portal.sql ========
-- MUVENS OS — Fase 2 / Portal do Cliente
-- Princípio: usuários 'cliente' NÃO têm acesso direto a nenhuma tabela interna (RLS os exclui). Todo acesso passa por funções
-- security definer que (1) exigem papel 'cliente' ativo com client_id, (2) filtram pelo client_id do usuário e (3) devolvem só
-- colunas/itens liberados pela equipe (projeto visível, tarefa não interna, arquivo marcado como visível).

-- Remove a leitura direta da ficha do cliente pelo próprio cliente (continha observações internas)
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (app.is_staff());

alter table public.projects add column client_visible boolean not null default false;
alter table public.tasks add column internal boolean not null default false;
alter table public.task_files add column client_visible boolean not null default false;
alter table public.task_comments add column from_client boolean not null default false;

create table public.client_requests (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('briefing','alteracao','atendimento')),
  subject text not null check (length(btrim(subject)) between 3 and 200), body text not null check (length(btrim(body)) between 3 and 8000),
  status text not null default 'aberta' check (status in ('aberta','em_andamento','resolvida')),
  response text, responded_by uuid references public.profiles(id), responded_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create index client_requests_client_idx on public.client_requests (client_id, created_at desc);
create table public.client_documents (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  category text not null default 'documento' check (category in ('documento','arquivo_final','relatorio')),
  name text not null, path text not null unique, size bigint,
  uploaded_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create index client_documents_client_idx on public.client_documents (client_id, created_at desc);
create trigger trg_client_requests_audit after insert or update on public.client_requests for each row execute function app.audit();
create trigger trg_client_documents_audit after insert or update or delete on public.client_documents for each row execute function app.audit();

do $$ declare t text; begin
  foreach t in array array['client_requests','client_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy creq_select on public.client_requests for select to authenticated using (app.has_role('admin','comercial'));
create policy creq_update on public.client_requests for update to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy cdoc_select on public.client_documents for select to authenticated using (app.is_staff());
create policy cdoc_write on public.client_documents for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));

-- ---------- funções do portal ----------
create or replace function app.portal_client() returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.current_client_id();
begin
  if v is null then raise exception 'Acesso restrito a clientes' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.portal_overview() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return jsonb_build_object(
    'client_name', (select name from public.clients where id = v),
    'projects_active', (select count(*) from public.projects where client_id = v and client_visible and status in ('planejamento','em_andamento')),
    'awaiting_approval', (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = v and p.client_visible and not t.internal and t.status = 'enviado'),
    'open_requests', (select count(*) from public.client_requests where client_id = v and status <> 'resolvida'),
    'next_deadlines', coalesce((select jsonb_agg(x) from (select jsonb_build_object('id', t.id, 'title', t.title, 'due_on', t.due_on, 'status', t.status, 'project', p.name) x
        from public.tasks t join public.projects p on p.id = t.project_id
        where p.client_id = v and p.client_visible and not t.internal and t.due_on is not null and t.status not in ('entregue','aprovado','cancelada')
        order by t.due_on limit 5) s), '[]'::jsonb));
end $$;

create or replace function public.portal_projects() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'due_on', p.due_on,
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due_on', t.due_on) order by t.due_on nulls last, t.created_at)
                         from public.tasks t where t.project_id = p.id and not t.internal and t.status <> 'cancelada'), '[]'::jsonb)) order by p.created_at desc)
    from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb);
end $$;

create or replace function public.portal_approvals() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project', p.name, 'due_on', t.due_on,
      'description', t.briefing_public,
      'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb)) order by t.due_on nulls last)
    from public.tasks t join public.projects p on p.id = t.project_id
    where p.client_id = v and p.client_visible and not t.internal and t.status = 'enviado'), '[]'::jsonb);
end $$;

create or replace function public.portal_decide(p_task uuid, p_decision text, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := app.portal_client(); v_task public.tasks; v_proj_name text; v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if p_decision not in ('aprovar','ajustes') then raise exception 'Decisão inválida' using errcode = '22023'; end if;
  if p_decision = 'ajustes' and v_comment is null then raise exception 'Descreva os ajustes desejados' using errcode = '22023'; end if;
  select tk.* into v_task from public.tasks tk join public.projects pr on pr.id = tk.project_id
   where tk.id = p_task and pr.client_id = v and pr.client_visible and not tk.internal for update of tk;
  if not found then raise exception 'Item não encontrado' using errcode = '42501'; end if;
  if v_task.status <> 'enviado' then raise exception 'Este item não está aguardando aprovação' using errcode = '23514'; end if;
  update public.tasks set status = case p_decision when 'aprovar' then 'aprovado' else 'ajustes' end where id = v_task.id;
  if v_comment is not null then insert into public.task_comments (task_id, author_id, body, from_client) values (v_task.id, auth.uid(), v_comment, true); end if;
  select name into v_proj_name from public.projects where id = v_task.project_id;
  perform app.notify(case p_decision when 'aprovar' then 'Cliente aprovou: ' else 'Cliente pediu ajustes: ' end || v_task.title, coalesce(v_comment, v_proj_name), '/projetos/tarefas/' || v_task.id,
                     case p_decision when 'aprovar' then 'info' else 'warning' end, case when v_task.assignee_id is null then 'comercial' end, v_task.assignee_id, null);
end $$;

create or replace function public.portal_requests() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'subject', subject, 'body', body, 'status', status, 'response', response, 'created_at', created_at, 'responded_at', responded_at) order by created_at desc)
                   from public.client_requests where client_id = v), '[]'::jsonb);
end $$;

create or replace function public.portal_create_request(p_kind text, p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := app.portal_client(); v_id uuid;
begin
  insert into public.client_requests (client_id, kind, subject, body, created_by) values (v, p_kind, btrim(p_subject), btrim(p_body), auth.uid()) returning id into v_id;
  perform app.notify('Nova solicitação do cliente: ' || btrim(p_subject), (select name from public.clients where id = v) || ' — ' || left(btrim(p_body), 200), '/portal', 'info', 'comercial', null, 'client.request:' || v_id);
  return v_id;
end $$;

create or replace function public.portal_documents() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
      select jsonb_build_object('kind', 'doc', 'id', d.id, 'name', d.name, 'category', d.category, 'created_at', d.created_at) x from public.client_documents d where d.client_id = v
      union all
      select jsonb_build_object('kind', 'task', 'id', f.id, 'name', f.name, 'category', 'arquivo_final', 'context', t.title, 'created_at', f.created_at)
        from public.task_files f join public.tasks t on t.id = f.task_id join public.projects p on p.id = t.project_id
       where p.client_id = v and p.client_visible and not t.internal and f.client_visible and t.status in ('aprovado','entregue')) u), '[]'::jsonb);
end $$;

-- Autoriza um download e devolve onde está o arquivo (o servidor então gera a URL assinada)
create or replace function public.portal_file_path(p_kind text, p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client(); r record;
begin
  if p_kind = 'doc' then
    select path, name into r from public.client_documents where id = p_id and client_id = v;
    if found then return jsonb_build_object('bucket', 'client-docs', 'path', r.path, 'name', r.name); end if;
  elsif p_kind = 'task' then
    select f.path, f.name, t.status into r from public.task_files f join public.tasks t on t.id = f.task_id join public.projects p on p.id = t.project_id
     where f.id = p_id and p.client_id = v and p.client_visible and not t.internal and f.client_visible and t.status in ('enviado','aprovado','entregue');
    if found then return jsonb_build_object('bucket', 'task-files', 'path', r.path, 'name', r.name); end if;
  end if;
  raise exception 'Arquivo não encontrado' using errcode = '42501';
end $$;

create or replace function public.portal_proposals() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('number', number, 'title', title, 'status', status, 'total_value', total_value, 'valid_until', valid_until, 'token', token) order by number desc)
                   from public.proposals where client_id = v and status <> 'rascunho'), '[]'::jsonb);
end $$;
create or replace function public.portal_contracts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'title', title, 'status', status, 'starts_on', starts_on, 'ends_on', ends_on, 'signed_at', signed_at) order by number desc)
                   from public.contracts where client_id = v and status in ('enviado_assinatura','assinado')), '[]'::jsonb);
end $$;
create or replace function public.portal_contract(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client(); r record;
begin
  select id, number, title, status, body, starts_on, ends_on, signed_at into r from public.contracts where id = p_id and client_id = v and status in ('enviado_assinatura','assinado');
  if not found then raise exception 'Contrato não encontrado' using errcode = '42501'; end if;
  return to_jsonb(r);
end $$;

-- descrição para o cliente (separada do briefing interno)
alter table public.tasks add column briefing_public text;

do $$ declare f text; begin
  foreach f in array array['portal_overview()','portal_projects()','portal_approvals()','portal_decide(uuid,text,text)','portal_requests()','portal_create_request(text,text,text)','portal_documents()','portal_file_path(text,uuid)','portal_proposals()','portal_contracts()','portal_contract(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function app.portal_client() from public, anon, authenticated;
grant execute on function app.portal_client() to authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('client-docs', 'client-docs', false, 52428800) on conflict (id) do nothing;
    execute $p$create policy "client docs read" on storage.objects for select to authenticated using (bucket_id = 'client-docs' and app.is_staff())$p$;
    execute $p$create policy "client docs write" on storage.objects for insert to authenticated with check (bucket_id = 'client-docs' and app.has_role('admin','comercial','designer','trafego'))$p$;
    execute $p$create policy "client docs delete" on storage.objects for delete to authenticated using (bucket_id = 'client-docs' and app.has_role('admin','comercial','designer','trafego'))$p$;
  end if;
end $$;

-- ======== 20261014000011_prospecting.sql ========
-- MUVENS OS — Prospecção (Fase 3 / estrutura): descoberta, análise, mensagens, envio de e-mail com salvaguardas.
-- Envio de e-mail DESLIGADO por padrão (sending_enabled=false) e exige identificação da empresa + link de descadastro.
-- Nenhum disparo automático de WhatsApp: o canal WhatsApp é "assistido" (uma pessoa clica em enviar).

create table public.outreach_settings (
  id int primary key default 1 check (id = 1),
  sender_name text, sender_email text, reply_to text,
  company_legal_name text, company_document text, company_address text,        -- identificação do remetente (obrigatória p/ enviar)
  daily_email_limit int not null default 30 check (daily_email_limit between 1 and 500),
  window_start_hour int not null default 9 check (window_start_hour between 0 and 23),
  window_end_hour int not null default 18 check (window_end_hour between 1 and 24),
  weekdays_only boolean not null default true,
  require_approval boolean not null default true,                                -- true = uma pessoa aprova cada mensagem
  sending_enabled boolean not null default false,
  followup_days int not null default 4 check (followup_days between 2 and 30),
  max_followups int not null default 1 check (max_followups between 0 and 3),
  updated_at timestamptz not null default now(),
  check (window_end_hour > window_start_hour)
);
insert into public.outreach_settings (id) values (1);
create trigger trg_outreach_settings_touch before update on public.outreach_settings for each row execute function app.touch_updated_at();
create trigger trg_outreach_settings_audit after update on public.outreach_settings for each row execute function app.audit();

create table public.prospect_campaigns (
  id uuid primary key default gen_random_uuid(), name text not null, niche text not null, city text not null,
  status text not null default 'ativa' check (status in ('ativa','pausada','encerrada')),
  max_results int not null default 20 check (max_results between 1 and 60),
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.prospect_campaigns(id) on delete set null,
  source text not null default 'manual' check (source in ('google_maps','manual')),
  place_id text,
  name text not null, category text, address text, phone text, website text, website_domain text, email text,
  rating numeric(2,1), reviews_count int, maps_url text, google_fetched_at timestamptz,
  status text not null default 'novo' check (status in ('novo','analisado','aprovado','contatado','respondeu','descartado','convertido')),
  score int check (score between 0 and 100), recommended_service text, analysis jsonb, analyzed_at timestamptz, analysis_error text,
  lead_id uuid references public.leads(id) on delete set null,
  legal_basis text not null default 'legitimo_interesse',
  unsub_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  notes text, created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index prospects_place_uidx on public.prospects (place_id) where place_id is not null;
create unique index prospects_email_uidx on public.prospects (lower(email)) where email is not null;
create unique index prospects_domain_uidx on public.prospects (website_domain) where website_domain is not null;
create index prospects_status_idx on public.prospects (status, score desc);
create index prospects_campaign_idx on public.prospects (campaign_id);
create trigger trg_prospects_touch before update on public.prospects for each row execute function app.touch_updated_at();
create trigger trg_prospects_audit after insert or update or delete on public.prospects for each row execute function app.audit();

create or replace function app.prospects_before() returns trigger language plpgsql as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  if new.website is not null and btrim(new.website) <> '' then
    new.website := btrim(new.website);
    new.website_domain := lower(regexp_replace(regexp_replace(new.website, '^https?://', '', 'i'), '^www\.|[/?#].*$', '', 'gi'));
    if new.website_domain = '' then new.website_domain := null; end if;
  else new.website := null; new.website_domain := null; end if;
  return new;
end $$;
create trigger trg_prospects_before before insert or update on public.prospects for each row execute function app.prospects_before();

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp_manual')),
  step int not null default 1 check (step between 1 and 4),
  subject text, body text not null,
  status text not null default 'rascunho' check (status in ('rascunho','aprovada','enviando','enviada','falhou','cancelada')),
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  sent_at timestamptz, provider_id text, error text,
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create unique index outreach_one_per_step on public.outreach_messages (prospect_id, channel, step) where status <> 'cancelada';
create index outreach_status_idx on public.outreach_messages (status, created_at);
create trigger trg_outreach_audit after insert or update on public.outreach_messages for each row execute function app.audit();

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(), email text, domain text, phone text,
  source text not null default 'manual' check (source in ('descadastro','manual','bounce','reclamacao')), note text,
  created_at timestamptz not null default now(),
  check (email is not null or domain is not null or phone is not null)
);
create unique index suppression_email_uidx on public.suppression_list (lower(email)) where email is not null;
create unique index suppression_domain_uidx on public.suppression_list (lower(domain)) where domain is not null;

-- ---------- descadastro público (anon) ----------
create or replace function public.unsubscribe_prospect(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.prospects;
begin
  select * into p from public.prospects where unsub_token = p_token;
  if not found then return false; end if;
  if p.email is not null then insert into public.suppression_list (email, source) values (p.email, 'descadastro') on conflict do nothing; end if;
  if p.website_domain is not null then insert into public.suppression_list (domain, source, note) values (p.website_domain, 'descadastro', 'descadastro de ' || coalesce(p.email, 'prospecto')) on conflict do nothing; end if;
  update public.prospects set status = 'descartado' where id = p.id and status <> 'convertido';
  update public.outreach_messages set status = 'cancelada' where prospect_id = p.id and status in ('rascunho','aprovada');
  return true;
end $$;

-- ---------- envio: seleção atômica com todas as salvaguardas (só service role) ----------
create or replace function public.claim_outreach(p_limit int default 10) returns table (id uuid, prospect_id uuid, to_email text, subject text, body text, unsub_token text, step int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare s public.outreach_settings; v_now timestamp := (now() at time zone 'America/Sao_Paulo'); v_sent int; v_room int;
begin
  select * into s from public.outreach_settings where id = 1;
  if not s.sending_enabled then return; end if;
  if s.sender_name is null or s.sender_email is null or s.company_legal_name is null or s.company_address is null then return; end if;     -- identificação obrigatória
  if extract(hour from v_now) < s.window_start_hour or extract(hour from v_now) >= s.window_end_hour then return; end if;
  if s.weekdays_only and extract(isodow from v_now) in (6, 7) then return; end if;
  select count(*) into v_sent from public.outreach_messages m where m.channel = 'email' and m.status in ('enviada','enviando') and m.sent_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_room := least(p_limit, s.daily_email_limit - v_sent);
  if v_room <= 0 then return; end if;
  return query
  with next as (
    select m.id from public.outreach_messages m join public.prospects p on p.id = m.prospect_id
     where m.channel = 'email' and m.status = 'aprovada' and p.email is not null
       and p.status not in ('descartado','respondeu','convertido')
       and not exists (select 1 from public.suppression_list sl where lower(sl.email) = p.email or lower(sl.domain) = p.website_domain)
     order by m.approved_at nulls last, m.created_at limit v_room for update of m skip locked)
  update public.outreach_messages m set status = 'enviando', sent_at = now() from next n, public.prospects p
   where m.id = n.id and p.id = m.prospect_id
  returning m.id, m.prospect_id, p.email, m.subject, m.body, p.unsub_token, m.step;
end $$;

create or replace function public.finish_outreach(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_prospect uuid;
begin
  if p_ok then
    update public.outreach_messages set status = 'enviada', provider_id = p_provider_id, error = null where id = p_id returning prospect_id into v_prospect;
    update public.prospects set status = 'contatado' where id = v_prospect and status in ('novo','analisado','aprovado');
  else
    update public.outreach_messages set status = 'falhou', error = left(p_error, 1000), sent_at = null where id = p_id;
  end if;
end $$;

-- Candidatos a follow-up: mensagem enviada há >= followup_days, sem resposta, ainda sem o próximo passo.
create or replace function public.followup_candidates() returns table (prospect_id uuid, next_step int)
language sql stable security definer set search_path = public as $$
  select p.id, m.step + 1 from public.outreach_messages m join public.prospects p on p.id = m.prospect_id, public.outreach_settings s
   where s.id = 1 and m.channel = 'email' and m.status = 'enviada' and p.status = 'contatado' and p.email is not null
     and m.step = (select max(x.step) from public.outreach_messages x where x.prospect_id = p.id and x.channel = 'email' and x.status = 'enviada')
     and m.step <= s.max_followups and m.sent_at < now() - (s.followup_days || ' days')::interval
     and not exists (select 1 from public.outreach_messages y where y.prospect_id = p.id and y.channel = 'email' and y.step = m.step + 1 and y.status <> 'cancelada')
     and not exists (select 1 from public.suppression_list sl where lower(sl.email) = p.email or lower(sl.domain) = p.website_domain)
$$;

-- Retenção conservadora dos dados vindos do Google (cache de até 30 dias) para prospectos ainda não trabalhados.
create or replace function public.run_prospect_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.prospects set address = null, phone = null, website = null, rating = null, reviews_count = null, maps_url = null
   where source = 'google_maps' and status in ('novo','descartado') and google_fetched_at < now() - interval '30 days'
     and (address is not null or phone is not null or website is not null or maps_url is not null);
  get diagnostics n = row_count;
  return jsonb_build_object('purged_google_snapshots', n);
end $$;

-- ---------- segurança ----------
do $$ declare t text; begin
  foreach t in array array['outreach_settings','prospect_campaigns','prospects','outreach_messages','suppression_list'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy settings_select on public.outreach_settings for select to authenticated using (app.has_role('admin','comercial'));
create policy settings_update on public.outreach_settings for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create policy campaigns_all on public.prospect_campaigns for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy prospects_all on public.prospects for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy outreach_all on public.outreach_messages for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy suppression_all on public.suppression_list for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));

revoke execute on function public.unsubscribe_prospect(text), public.claim_outreach(int), public.finish_outreach(uuid, boolean, text, text), public.followup_candidates(), public.run_prospect_scans() from public, anon;
grant execute on function public.unsubscribe_prospect(text) to anon, authenticated;
grant execute on function public.claim_outreach(int), public.finish_outreach(uuid, boolean, text, text), public.followup_candidates(), public.run_prospect_scans() to service_role;
