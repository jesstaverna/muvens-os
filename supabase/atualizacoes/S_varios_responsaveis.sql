-- MUVENS OS — 0027 Vários responsáveis por tarefa
-- tasks.assignee_id continua sendo o RESPONSÁVEL PRINCIPAL (métricas e avisos de atraso). Os demais ficam em task_assignees.

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid default auth.uid() references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists task_assignees_user_idx on public.task_assignees (user_id);
alter table public.task_assignees enable row level security;
grant select, insert, update, delete on public.task_assignees to authenticated;
grant all on public.task_assignees to service_role;
revoke all on public.task_assignees from anon;
drop policy if exists tassign_select on public.task_assignees;
drop policy if exists tassign_write on public.task_assignees;
create policy tassign_select on public.task_assignees for select to authenticated using (app.is_staff());
create policy tassign_write on public.task_assignees for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));

create or replace function app.task_assignees_after() returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from public.tasks where id = new.task_id;
  insert into public.task_events (task_id, kind, detail, actor_id) values (new.task_id, 'responsavel', 'Incluído(a): ' || coalesce((select full_name from public.profiles where id = new.user_id), '—'), auth.uid());
  if new.user_id is distinct from auth.uid() then
    perform app.notify('Você foi incluído(a) em uma tarefa', v_title, '/projetos/tarefas/' || new.task_id, 'info', null, new.user_id, 'task.assigned:' || new.task_id || ':' || new.user_id);
  end if;
  return null;
end $$;
drop trigger if exists trg_task_assignees_after on public.task_assignees;
create trigger trg_task_assignees_after after insert on public.task_assignees for each row execute function app.task_assignees_after();

-- portal: todos os nomes (principal + demais)
create or replace function app.task_people(p_task uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(nm order by nm), '[]'::jsonb) from (
    select pr.full_name as nm from public.tasks t join public.profiles pr on pr.id = t.assignee_id where t.id = p_task and pr.full_name <> ''
    union
    select pr.full_name from public.task_assignees ta join public.profiles pr on pr.id = ta.user_id where ta.task_id = p_task and pr.full_name <> '') s
$$;
revoke execute on function app.task_people(uuid) from public, anon, authenticated;
grant execute on function app.task_people(uuid) to authenticated;

create or replace function public.portal_board() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', a.full_name, 'assignees', app.task_people(t.id), 'client_wait_days', coalesce(w.client_wait_days, 0),
        'links', (select count(*) from public.task_links l where l.task_id = t.id and l.client_visible),
        'comments', (select count(*) from public.task_comments c where c.task_id = t.id and (c.from_client or c.client_visible))) order by t.due_on nulls last, t.created_at)
      from public.tasks t join public.projects p on p.id = t.project_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
      where p.client_id = v and p.client_visible and p.status <> 'cancelado' and not t.internal and t.status <> 'cancelada'), '[]'::jsonb));
end $$;

create or replace function public.portal_task_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_id);
begin
  return jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority, 'origin', t.origin,
    'client_wait_days', coalesce((select client_wait_days from public.task_client_wait where task_id = t.id), 0),
    'description', t.briefing_public, 'created_at', t.created_at, 'project', (select name from public.projects where id = t.project_id),
    'assignee', (select full_name from public.profiles where id = t.assignee_id), 'assignees', app.task_people(t.id),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'url', l.url, 'from_client', l.from_client, 'created_at', l.created_at) order by l.created_at)
                       from public.task_links l where l.task_id = t.id and l.client_visible), '[]'::jsonb),
    'files', case when t.status in ('enviado','aprovado','entregue') then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb) else '[]'::jsonb end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'from_client', c.from_client, 'author', case when c.from_client then 'Você' else coalesce(pr.full_name, 'Equipe Muvens') end, 'created_at', c.created_at) order by c.created_at)
                          from public.task_comments c left join public.profiles pr on pr.id = c.author_id where c.task_id = t.id and (c.from_client or c.client_visible)), '[]'::jsonb));
end $$;
