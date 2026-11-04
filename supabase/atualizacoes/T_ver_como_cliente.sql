-- MUVENS OS — 0028 Equipe vê o quadro EXATAMENTE como o cliente vê (mesma montagem de dados do portal)

create or replace function app.client_board(v uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', a.full_name, 'assignees', app.task_people(t.id), 'client_wait_days', coalesce(w.client_wait_days, 0),
        'links', (select count(*) from public.task_links l where l.task_id = t.id and l.client_visible),
        'comments', (select count(*) from public.task_comments c where c.task_id = t.id and (c.from_client or c.client_visible))) order by t.due_on nulls last, t.created_at)
      from public.tasks t join public.projects p on p.id = t.project_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
      where p.client_id = v and p.client_visible and p.status <> 'cancelado' and not t.internal and t.status <> 'cancelada'), '[]'::jsonb))
$$;
revoke execute on function app.client_board(uuid) from public, anon, authenticated;
grant execute on function app.client_board(uuid) to authenticated;

create or replace function public.portal_board() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return app.client_board(app.portal_client());
end $$;

-- visão da equipe: o mesmo JSON do cliente + projetos do cliente ainda NÃO liberados no portal (para avisar)
create or replace function public.staff_client_board(p_client uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return app.client_board(p_client) || jsonb_build_object(
    'client_name', (select name from public.clients where id = p_client),
    'hidden_projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.created_at desc) from public.projects p where p.client_id = p_client and not p.client_visible and p.status <> 'cancelado'), '[]'::jsonb));
end $$;
revoke execute on function public.staff_client_board(uuid) from public, anon;
grant execute on function public.staff_client_board(uuid) to authenticated;
