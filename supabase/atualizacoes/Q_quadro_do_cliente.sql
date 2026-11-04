-- MUVENS OS — 0025 Quadro do cliente: demandas por área (Diagramação / Social Media), links de conteúdo, solicitações e alterações pelo portal
-- O cliente continua SEM acesso direto às tabelas: tudo passa por funções security definer filtradas pela empresa do usuário.

alter table public.tasks add column if not exists area text;
alter table public.tasks add column if not exists origin text not null default 'equipe';
alter table public.tasks drop constraint if exists tasks_area_check;
alter table public.tasks add constraint tasks_area_check check (area is null or area in ('diagramacao','social_media','outro'));
alter table public.tasks drop constraint if exists tasks_origin_check;
alter table public.tasks add constraint tasks_origin_check check (origin in ('equipe','cliente'));
-- novos status: 'solicitada' (pedido do cliente aguardando triagem) e 'aguardando_cliente' (equipe espera o conteúdo do cliente)
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('solicitada','aguardando_cliente','a_fazer','em_andamento','produzido','enviado','ajustes','aprovado','entregue','cancelada'));

-- datas da demanda: início, entrega (due_on), devolução da revisão pelo cliente e entrega das alterações pela equipe
alter table public.tasks add column if not exists starts_on date;
alter table public.tasks add column if not exists review_due_on date;    -- até quando o cliente devolve a revisão (preenchida ao enviar para aprovação)
alter table public.tasks add column if not exists changes_due_on date;   -- até quando a equipe entrega as alterações (preenchida ao pedir ajustes)
alter table public.tasks add column if not exists late_team_notified_on date;
alter table public.tasks add column if not exists late_client_notified_on date;

-- configurações do quadro: prazos padrão e avisos de atraso por e-mail (desligados até alguém ligar)
create table if not exists public.board_settings (
  id int primary key default 1 check (id = 1),
  review_days int not null default 3 check (review_days between 1 and 30),
  changes_days int not null default 2 check (changes_days between 1 and 30),
  late_email_team boolean not null default false,
  late_email_client boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.board_settings (id) values (1) on conflict do nothing;
alter table public.board_settings enable row level security;
grant select, insert, update on public.board_settings to authenticated;
grant all on public.board_settings to service_role;
revoke all on public.board_settings from anon;
drop policy if exists bset_select on public.board_settings;
drop policy if exists bset_update on public.board_settings;
create policy bset_select on public.board_settings for select to authenticated using (app.is_staff());
create policy bset_update on public.board_settings for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create or replace function app.board_days(p_which text) returns int language sql stable security definer set search_path = public as $$
  select case p_which when 'review' then review_days else changes_days end from public.board_settings where id = 1
$$;
revoke execute on function app.board_days(text) from public, anon;
grant execute on function app.board_days(text) to authenticated;

-- ao enviar para aprovação / pedir ajustes, sugere o prazo de retorno (a menos que a pessoa tenha informado outro)
create or replace function app.tasks_dates() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'enviado' and new.review_due_on is not distinct from old.review_due_on then new.review_due_on := app.br_date(now()) + coalesce(app.board_days('review'), 3); end if;
    if new.status = 'ajustes' and new.changes_due_on is not distinct from old.changes_due_on then new.changes_due_on := app.br_date(now()) + coalesce(app.board_days('changes'), 2); end if;
    new.late_team_notified_on := null; new.late_client_notified_on := null;   -- mudou de etapa: o controle de avisos recomeça
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_dates on public.tasks;
create trigger trg_tasks_dates before update on public.tasks for each row execute function app.tasks_dates();

-- comentários da equipe podem ser abertos ao cliente (padrão: internos)
alter table public.task_comments add column if not exists client_visible boolean not null default false;
update public.task_comments set client_visible = true where from_client and not client_visible;

-- links (Drive, Dropbox, WeTransfer…) onde ficam conteúdos enviados pelo cliente e entregas da equipe
create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null default 'conteudo' check (kind in ('conteudo','referencia','entrega')),
  label text, url text not null check (url ~* '^https?://' and length(url) <= 1000),
  from_client boolean not null default false, client_visible boolean not null default true,
  added_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists task_links_task_idx on public.task_links (task_id, created_at);
drop trigger if exists trg_task_links_audit on public.task_links;
create trigger trg_task_links_audit after insert or update or delete on public.task_links for each row execute function app.audit();
alter table public.task_links enable row level security;
grant select, insert, update, delete on public.task_links to authenticated;
grant all on public.task_links to service_role;
revoke all on public.task_links from anon;
drop policy if exists tlinks_select on public.task_links;
drop policy if exists tlinks_write on public.task_links;
create policy tlinks_select on public.task_links for select to authenticated using (app.is_staff());
create policy tlinks_write on public.task_links for all to authenticated using (app.has_role('admin','comercial','designer','trafego')) with check (app.has_role('admin','comercial','designer','trafego'));

-- ---------- funções do portal ----------
-- tarefa acessível ao cliente: da empresa dele, projeto liberado, não interna
create or replace function app.portal_task(p_id uuid) returns public.tasks language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client(); r public.tasks;
begin
  select tk.* into r from public.tasks tk join public.projects pr on pr.id = tk.project_id
   where tk.id = p_id and pr.client_id = v and pr.client_visible and not tk.internal and tk.status <> 'cancelada';
  if not found then raise exception 'Item não encontrado' using errcode = '42501'; end if;
  return r;
end $$;

create or replace function public.portal_board() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', a.full_name,
        'links', (select count(*) from public.task_links l where l.task_id = t.id and l.client_visible),
        'comments', (select count(*) from public.task_comments c where c.task_id = t.id and (c.from_client or c.client_visible))) order by t.due_on nulls last, t.created_at)
      from public.tasks t join public.projects p on p.id = t.project_id left join public.profiles a on a.id = t.assignee_id
      where p.client_id = v and p.client_visible and p.status <> 'cancelado' and not t.internal and t.status <> 'cancelada'), '[]'::jsonb));
end $$;

create or replace function public.portal_task_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_id);
begin
  return jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority, 'origin', t.origin,
    'description', t.briefing_public, 'created_at', t.created_at, 'project', (select name from public.projects where id = t.project_id),
    'assignee', (select full_name from public.profiles where id = t.assignee_id),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'url', l.url, 'from_client', l.from_client, 'created_at', l.created_at) order by l.created_at)
                       from public.task_links l where l.task_id = t.id and l.client_visible), '[]'::jsonb),
    'files', case when t.status in ('enviado','aprovado','entregue') then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb) else '[]'::jsonb end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'from_client', c.from_client, 'author', case when c.from_client then 'Você' else coalesce(pr.full_name, 'Equipe Muvens') end, 'created_at', c.created_at) order by c.created_at)
                          from public.task_comments c left join public.profiles pr on pr.id = c.author_id where c.task_id = t.id and (c.from_client or c.client_visible)), '[]'::jsonb));
end $$;

create or replace function public.portal_create_task(p_project uuid, p_area text, p_title text, p_description text, p_due date default null, p_link text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := app.portal_client(); v_id uuid; v_title text := btrim(coalesce(p_title, '')); v_desc text := nullif(btrim(coalesce(p_description, '')), ''); v_link text := nullif(btrim(coalesce(p_link, '')), ''); v_proj text;
begin
  if length(v_title) < 3 or length(v_title) > 200 then raise exception 'Informe um título (3 a 200 caracteres)' using errcode = '22023'; end if;
  if p_area not in ('diagramacao','social_media','outro') then raise exception 'Escolha a área da demanda' using errcode = '22023'; end if;
  if v_desc is not null and length(v_desc) > 8000 then raise exception 'Descrição muito longa' using errcode = '22023'; end if;
  if v_link is not null and (v_link !~* '^https?://' or length(v_link) > 1000) then raise exception 'O link precisa começar com http:// ou https://' using errcode = '22023'; end if;
  select name into v_proj from public.projects where id = p_project and client_id = v and client_visible and status not in ('cancelado','concluido');
  if not found then raise exception 'Projeto não encontrado' using errcode = '42501'; end if;
  insert into public.tasks (project_id, title, briefing, briefing_public, due_on, status, origin, area, created_by)
  values (p_project, v_title, 'Solicitação do cliente' || coalesce(E':\n' || v_desc, ''), v_desc, p_due, 'solicitada', 'cliente', p_area, auth.uid()) returning id into v_id;
  if v_link is not null then insert into public.task_links (task_id, kind, url, from_client, added_by) values (v_id, 'conteudo', v_link, true, auth.uid()); end if;
  perform app.notify('Nova demanda do cliente: ' || v_title, (select name from public.clients where id = v) || ' — ' || v_proj, '/projetos/tarefas/' || v_id, 'info', 'comercial', null, 'client.task:' || v_id);
  return v_id;
end $$;

create or replace function public.portal_add_link(p_task uuid, p_url text, p_label text default null, p_kind text default 'conteudo') returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_task); v_url text := btrim(coalesce(p_url, '')); v_label text := nullif(left(btrim(coalesce(p_label, '')), 120), '');
begin
  if p_kind not in ('conteudo','referencia') then raise exception 'Tipo de link inválido' using errcode = '22023'; end if;
  if v_url !~* '^https?://' or length(v_url) > 1000 then raise exception 'O link precisa começar com http:// ou https://' using errcode = '22023'; end if;
  insert into public.task_links (task_id, kind, label, url, from_client, added_by) values (t.id, p_kind, v_label, v_url, true, auth.uid());
  if t.status = 'aguardando_cliente' and p_kind = 'conteudo' then update public.tasks set status = 'a_fazer' where id = t.id; end if;   -- conteúdo recebido: volta para a fila da equipe
  perform app.notify('Cliente enviou ' || case p_kind when 'conteudo' then 'conteúdo' else 'referência' end || ': ' || t.title, v_url, '/projetos/tarefas/' || t.id, 'info', case when t.assignee_id is null then 'comercial' end, t.assignee_id, null);
end $$;

create or replace function public.portal_add_comment(p_task uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_task); v_body text := btrim(coalesce(p_body, ''));
begin
  if length(v_body) < 1 or length(v_body) > 4000 then raise exception 'Escreva uma mensagem (até 4000 caracteres)' using errcode = '22023'; end if;
  insert into public.task_comments (task_id, author_id, body, from_client, client_visible) values (t.id, auth.uid(), v_body, true, true);
  perform app.notify('Cliente comentou: ' || t.title, left(v_body, 200), '/projetos/tarefas/' || t.id, 'info', case when t.assignee_id is null then 'comercial' end, t.assignee_id, null);
end $$;

-- "Já enviei o conteúdo" (por outro canal, ex.: WhatsApp): devolve a demanda à fila da equipe
create or replace function public.portal_content_sent(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_task);
begin
  if t.status <> 'aguardando_cliente' then raise exception 'Esta demanda não está aguardando conteúdo' using errcode = '23514'; end if;
  update public.tasks set status = 'a_fazer' where id = t.id;
  perform app.notify('Cliente avisou que enviou o conteúdo: ' || t.title, null, '/projetos/tarefas/' || t.id, 'info', case when t.assignee_id is null then 'comercial' end, t.assignee_id, null);
end $$;

-- pedido de alteração sobre uma peça já aprovada/entregue: nasce uma nova demanda ligada à original
create or replace function public.portal_request_change(p_task uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t public.tasks := app.portal_task(p_task); v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  if t.status not in ('aprovado','entregue') then raise exception 'Alterações só podem ser pedidas após a aprovação' using errcode = '23514'; end if;
  if length(v_body) < 3 or length(v_body) > 8000 then raise exception 'Descreva a alteração desejada' using errcode = '22023'; end if;
  insert into public.tasks (project_id, title, briefing, briefing_public, status, origin, area, created_by)
  values (t.project_id, left('Alteração: ' || t.title, 200), 'Alteração solicitada pelo cliente sobre "' || t.title || E'":\n' || v_body, v_body, 'solicitada', 'cliente', t.area, auth.uid()) returning id into v_id;
  perform app.notify('Cliente pediu alteração: ' || t.title, left(v_body, 200), '/projetos/tarefas/' || v_id, 'warning', case when t.assignee_id is null then 'comercial' end, t.assignee_id, null);
  return v_id;
end $$;

do $$ declare f text; begin
  foreach f in array array['portal_board()','portal_task_detail(uuid)','portal_create_task(uuid,text,text,text,date,text)','portal_add_link(uuid,text,text,text)','portal_add_comment(uuid,text)','portal_content_sent(uuid)','portal_request_change(uuid,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function app.portal_task(uuid) from public, anon, authenticated;
grant execute on function app.portal_task(uuid) to authenticated;

-- atrasos para o aviso por e-mail (só o servidor usa). 'equipe' = a Muvens está devendo; 'cliente' = quem deve é o cliente (aprovação ou conteúdo).
create or replace function public.task_delays() returns table (task_id uuid, title text, project text, client_id uuid, client_name text, assignee_id uuid, assignee_name text, assignee_email text, side text, due date, days_late int, status text)
language plpgsql stable security definer set search_path = public as $$
declare today date := app.br_date(now());
begin
  return query
  select t.id, t.title, p.name, c.id, c.name, a.id, a.full_name, a.email,
         case when t.status in ('enviado','aguardando_cliente') then 'cliente' else 'equipe' end,
         case t.status when 'enviado' then coalesce(t.review_due_on, t.due_on) when 'ajustes' then coalesce(t.changes_due_on, t.due_on) else t.due_on end as d,
         (today - case t.status when 'enviado' then coalesce(t.review_due_on, t.due_on) when 'ajustes' then coalesce(t.changes_due_on, t.due_on) else t.due_on end)::int, t.status
    from public.tasks t join public.projects p on p.id = t.project_id join public.clients c on c.id = p.client_id left join public.profiles a on a.id = t.assignee_id
   where p.status not in ('cancelado','concluido') and t.status in ('solicitada','aguardando_cliente','a_fazer','em_andamento','produzido','enviado','ajustes')
     and case t.status when 'enviado' then coalesce(t.review_due_on, t.due_on) when 'ajustes' then coalesce(t.changes_due_on, t.due_on) else t.due_on end < today
     and (case when t.status in ('enviado','aguardando_cliente') then not t.internal else true end);
end $$;
revoke execute on function public.task_delays() from public, anon, authenticated;
grant execute on function public.task_delays() to service_role;
