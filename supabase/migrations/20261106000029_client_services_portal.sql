-- MUVENS OS — 0029 Serviços do cliente no portal e nas tarefas
-- O cliente vê quais serviços tem (nome, tipo de cobrança, período, descrição) e as demandas de cada um. NUNCA vê valores.

alter table public.client_services add column if not exists portal_visible boolean not null default true;
alter table public.client_services add column if not exists description text;     -- o que está incluído, escrito para o cliente
alter table public.tasks add column if not exists service_id uuid references public.client_services(id) on delete set null;
create index if not exists tasks_service_idx on public.tasks (service_id) where service_id is not null;

create or replace function app.client_board(v uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.service) order by s.starts_on, s.created_at)
                          from public.client_services s where s.client_id = v and s.portal_visible and s.status <> 'encerrado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', a.full_name, 'assignees', app.task_people(t.id), 'client_wait_days', coalesce(w.client_wait_days, 0),
        'service_id', case when sv.portal_visible then sv.id end, 'service', case when sv.portal_visible then sv.service end,
        'links', (select count(*) from public.task_links l where l.task_id = t.id and l.client_visible),
        'comments', (select count(*) from public.task_comments c where c.task_id = t.id and (c.from_client or c.client_visible))) order by t.due_on nulls last, t.created_at)
      from public.tasks t join public.projects p on p.id = t.project_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
        left join public.client_services sv on sv.id = t.service_id
      where p.client_id = v and p.client_visible and p.status <> 'cancelado' and not t.internal and t.status <> 'cancelada'), '[]'::jsonb))
$$;

create or replace function public.portal_services() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.service, 'billing', s.billing, 'status', s.status, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'description', s.description,
      'open_tasks', (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where t.service_id = s.id and p.client_visible and not t.internal and t.status not in ('entregue','cancelada')),
      'done_tasks', (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where t.service_id = s.id and p.client_visible and not t.internal and t.status = 'entregue')) order by s.starts_on, s.created_at)
    from public.client_services s where s.client_id = v and s.portal_visible and s.status <> 'encerrado'), '[]'::jsonb);
end $$;

-- opções de serviço para a equipe escolher na tarefa (sem valores; designers não leem client_services direto)
create or replace function public.staff_service_options(p_client uuid default null) returns table (id uuid, client_id uuid, client_name text, service text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query select s.id, s.client_id, c.name, s.service, s.status from public.client_services s join public.clients c on c.id = s.client_id
    where (p_client is null or s.client_id = p_client) and s.status <> 'encerrado' order by c.name, s.service;
end $$;

do $$ declare f text; begin
  foreach f in array array['portal_services()','staff_service_options(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
