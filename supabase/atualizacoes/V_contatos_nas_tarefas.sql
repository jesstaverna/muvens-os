-- MUVENS OS — 0030 Contatos do cliente nas tarefas + nomes de equipe sem branco no portal

-- quais contatos cadastrados no cliente estão envolvidos em cada tarefa (ex.: quem aprova, quem envia o conteúdo)
create table if not exists public.task_contacts (
  task_id uuid not null references public.tasks(id) on delete cascade,
  contact_id uuid not null references public.client_contacts(id) on delete cascade,
  added_by uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (task_id, contact_id)
);
create index if not exists task_contacts_contact_idx on public.task_contacts (contact_id);
alter table public.task_contacts enable row level security;
grant select, insert, update, delete on public.task_contacts to authenticated;
grant all on public.task_contacts to service_role;
revoke all on public.task_contacts from anon;
drop policy if exists tcontacts_select on public.task_contacts;
drop policy if exists tcontacts_write on public.task_contacts;
create policy tcontacts_select on public.task_contacts for select to authenticated using (app.is_staff());
create policy tcontacts_write on public.task_contacts for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));

-- contato da tarefa precisa ser do MESMO cliente da tarefa
create or replace function app.task_contacts_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select p.client_id from public.tasks t join public.projects p on p.id = t.project_id where t.id = new.task_id) is distinct from (select client_id from public.client_contacts where id = new.contact_id) then
    raise exception 'O contato precisa ser do mesmo cliente da tarefa' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_task_contacts_check on public.task_contacts;
create trigger trg_task_contacts_check before insert on public.task_contacts for each row execute function app.task_contacts_check();

-- nome da equipe para exibir: nome do perfil, ou a parte do e-mail antes do @ se o nome estiver em branco
create or replace function app.person_label(p_name text, p_email text) returns text language sql immutable as $$
  select coalesce(nullif(btrim(p_name), ''), initcap(nullif(replace(replace(split_part(coalesce(p_email, ''), '@', 1), '.', ' '), '_', ' '), '')), 'Equipe Muvens')
$$;

create or replace function app.task_people(p_task uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(nm order by nm), '[]'::jsonb) from (
    select app.person_label(pr.full_name, pr.email) as nm from public.tasks t join public.profiles pr on pr.id = t.assignee_id where t.id = p_task
    union
    select app.person_label(pr.full_name, pr.email) from public.task_assignees ta join public.profiles pr on pr.id = ta.user_id where ta.task_id = p_task) s
$$;

-- contatos do cliente na tarefa (só nome e cargo; o e-mail/telefone ficam com a equipe)
create or replace function app.task_contact_list(p_task uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'role', c.role_title) order by c.is_primary desc, c.name), '[]'::jsonb)
    from public.task_contacts tc join public.client_contacts c on c.id = tc.contact_id where tc.task_id = p_task
$$;
revoke execute on function app.task_contact_list(uuid) from public, anon, authenticated;
grant execute on function app.task_contact_list(uuid) to authenticated;

create or replace function app.client_board(v uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.service) order by s.starts_on, s.created_at)
                          from public.client_services s where s.client_id = v and s.portal_visible and s.status <> 'encerrado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', case when a.id is not null then app.person_label(a.full_name, a.email) end, 'assignees', app.task_people(t.id), 'contacts', app.task_contact_list(t.id),
        'client_wait_days', coalesce(w.client_wait_days, 0),
        'service_id', case when sv.portal_visible then sv.id end, 'service', case when sv.portal_visible then sv.service end,
        'links', (select count(*) from public.task_links l where l.task_id = t.id and l.client_visible),
        'comments', (select count(*) from public.task_comments c where c.task_id = t.id and (c.from_client or c.client_visible))) order by t.due_on nulls last, t.created_at)
      from public.tasks t join public.projects p on p.id = t.project_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
        left join public.client_services sv on sv.id = t.service_id
      where p.client_id = v and p.client_visible and p.status <> 'cancelado' and not t.internal and t.status <> 'cancelada'), '[]'::jsonb))
$$;

create or replace function public.portal_task_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_id);
begin
  return jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority, 'origin', t.origin,
    'client_wait_days', coalesce((select client_wait_days from public.task_client_wait where task_id = t.id), 0),
    'description', t.briefing_public, 'created_at', t.created_at, 'project', (select name from public.projects where id = t.project_id),
    'service', (select s.service from public.client_services s where s.id = t.service_id and s.portal_visible),
    'assignee', (select app.person_label(full_name, email) from public.profiles where id = t.assignee_id), 'assignees', app.task_people(t.id), 'contacts', app.task_contact_list(t.id),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'url', l.url, 'from_client', l.from_client, 'created_at', l.created_at) order by l.created_at)
                       from public.task_links l where l.task_id = t.id and l.client_visible), '[]'::jsonb),
    'files', case when t.status in ('enviado','aprovado','entregue') then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb) else '[]'::jsonb end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'from_client', c.from_client, 'author', case when c.from_client then 'Você' else app.person_label(pr.full_name, pr.email) end, 'created_at', c.created_at) order by c.created_at)
                          from public.task_comments c left join public.profiles pr on pr.id = c.author_id where c.task_id = t.id and (c.from_client or c.client_visible)), '[]'::jsonb));
end $$;
