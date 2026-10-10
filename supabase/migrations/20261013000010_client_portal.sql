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
