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
