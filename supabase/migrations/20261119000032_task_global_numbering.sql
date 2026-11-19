-- Número sequencial global por tarefa; títulos continuam livres para edição.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_number bigint GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_task_number_unique_idx ON public.tasks(task_number);
COMMENT ON COLUMN public.tasks.task_number IS 'Identificador único sequencial exibido como #00001; gerado automaticamente e independente de título/cliente.';

-- Exponha somente o número a quem já tinha permissão de ver a tarefa no portal.
CREATE OR REPLACE FUNCTION app.client_board(v uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.service) order by s.starts_on, s.created_at)
                          from public.client_services s where s.client_id = v and s.portal_visible and s.status <> 'encerrado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'task_number', t.task_number, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', case when a.id is not null then app.person_label(a.full_name, a.email) end, 'assignees', app.task_people(t.id), 'contacts', app.task_contact_list(t.id),
        'client_wait_days', coalesce(w.client_wait_days, 0),
        'service_id', case when sv.portal_visible then sv.id end, 'service', case when sv.portal_visible then sv.service end,
        'links', (select count(*) from public.task_links l where l.task_id = t.id and l.client_visible),
        'comments', (select count(*) from public.task_comments c where c.task_id = t.id and (c.from_client or c.client_visible))) order by t.due_on nulls last, t.created_at)
      from public.tasks t join public.projects p on p.id = t.project_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
        left join public.client_services sv on sv.id = t.service_id
      where p.client_id = v and p.client_visible and p.status <> 'cancelado' and not t.internal and t.status <> 'cancelada'), '[]'::jsonb))
$function$


CREATE OR REPLACE FUNCTION public.portal_task_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t public.tasks := app.portal_task(p_id);
begin
  return jsonb_build_object('id', t.id, 'title', t.title, 'task_number', t.task_number, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority, 'origin', t.origin,
    'client_wait_days', coalesce((select client_wait_days from public.task_client_wait where task_id = t.id), 0),
    'description', t.briefing_public, 'created_at', t.created_at, 'project', (select name from public.projects where id = t.project_id),
    'service', (select s.service from public.client_services s where s.id = t.service_id and s.portal_visible),
    'assignee', (select app.person_label(full_name, email) from public.profiles where id = t.assignee_id), 'assignees', app.task_people(t.id), 'contacts', app.task_contact_list(t.id),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'url', l.url, 'from_client', l.from_client, 'created_at', l.created_at) order by l.created_at)
                       from public.task_links l where l.task_id = t.id and l.client_visible), '[]'::jsonb),
    'files', case when t.status in ('enviado','aprovado','entregue') then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb) else '[]'::jsonb end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'from_client', c.from_client, 'author', case when c.from_client then 'Você' else app.person_label(pr.full_name, pr.email) end, 'created_at', c.created_at) order by c.created_at)
                          from public.task_comments c left join public.profiles pr on pr.id = c.author_id where c.task_id = t.id and (c.from_client or c.client_visible)), '[]'::jsonb));
end $function$

