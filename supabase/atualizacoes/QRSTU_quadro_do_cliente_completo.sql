-- MUVENS OS — Quadro do cliente COMPLETO (Q + R + S + T + U). Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.

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
drop function if exists public.task_delays();   -- a versão da migração 26 devolve mais colunas: permite rodar este arquivo de novo depois dela
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


-- MUVENS OS — 0026 Prazos, atrasos e métricas do quadro
-- Regra central: o RELÓGIO DA EQUIPE PARA enquanto a demanda está com o cliente (aguardando conteúdo ou aprovação).
-- Entrega prevista = entrega combinada + dias em que o cliente segurou a demanda. Atraso do cliente não conta contra a equipe.

-- linha do tempo de cada tarefa: em que status ficou, de quando a quando (a partir do histórico já gravado)
create or replace view public.task_status_spans with (security_invoker = true) as
with pts as (
  select t.id as task_id,
         coalesce((select split_part(e.detail, ' → ', 1) from public.task_events e where e.task_id = t.id and e.kind = 'status' order by e.created_at, e.id limit 1), t.status) as status,
         t.created_at as at, 0::bigint as ord
    from public.tasks t
  union all
  select e.task_id, split_part(e.detail, ' → ', 2), e.created_at, e.id from public.task_events e where e.kind = 'status'
)
select task_id, status, at as from_at,
       coalesce(lead(at) over (partition by task_id order by at, ord), case when status in ('entregue','cancelada') then at else now() end) as to_at,
       (lead(at) over (partition by task_id order by at, ord) is null and status not in ('entregue','cancelada')) as is_open
  from pts;

-- dias em que a demanda ficou com o cliente (conteúdo ou aprovação)
create or replace view public.task_client_wait with (security_invoker = true) as
select task_id, coalesce(sum(extract(epoch from (to_at - from_at)) / 86400.0) filter (where status in ('enviado','aguardando_cliente')), 0)::numeric(8,2) as client_wait_days
  from public.task_status_spans group by task_id;

grant select on public.task_status_spans, public.task_client_wait to authenticated, service_role;
revoke all on public.task_status_spans, public.task_client_wait from anon;

-- portal: inclui os dias de espera do cliente (a data prevista é calculada na tela)
create or replace function public.portal_board() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := app.portal_client();
begin
  return jsonb_build_object(
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) order by p.created_at desc)
                          from public.projects p where p.client_id = v and p.client_visible and p.status <> 'cancelado'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'area', t.area, 'starts_on', t.starts_on, 'due_on', t.due_on, 'review_due_on', t.review_due_on, 'changes_due_on', t.changes_due_on, 'priority', t.priority,
        'origin', t.origin, 'project_id', p.id, 'project', p.name, 'assignee', a.full_name, 'client_wait_days', coalesce(w.client_wait_days, 0),
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
    'assignee', (select full_name from public.profiles where id = t.assignee_id),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'url', l.url, 'from_client', l.from_client, 'created_at', l.created_at) order by l.created_at)
                       from public.task_links l where l.task_id = t.id and l.client_visible), '[]'::jsonb),
    'files', case when t.status in ('enviado','aprovado','entregue') then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)) from public.task_files f where f.task_id = t.id and f.client_visible), '[]'::jsonb) else '[]'::jsonb end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'from_client', c.from_client, 'author', case when c.from_client then 'Você' else coalesce(pr.full_name, 'Equipe Muvens') end, 'created_at', c.created_at) order by c.created_at)
                          from public.task_comments c left join public.profiles pr on pr.id = c.author_id where c.task_id = t.id and (c.from_client or c.client_visible)), '[]'::jsonb));
end $$;

-- atrasos para os avisos: a entrega da equipe considera a espera do cliente (relógio pausado)
drop function if exists public.task_delays();
create or replace function public.task_delays() returns table (task_id uuid, title text, project text, client_id uuid, client_name text, assignee_id uuid, assignee_name text, assignee_email text, side text, due date, days_late int, status text, wait_days int)
language plpgsql stable security definer set search_path = public as $$
declare today date := app.br_date(now());
begin
  return query
  with x as (
    select t.id, t.title, p.name as pname, c.id as cid, c.name as cname, a.id as aid, a.full_name as aname, a.email as amail, t.status as st,
           case when t.status in ('enviado','aguardando_cliente') then 'cliente' else 'equipe' end as sd,
           ceil(coalesce(w.client_wait_days, 0))::int as wd,
           case t.status when 'enviado' then coalesce(t.review_due_on, t.due_on) when 'ajustes' then coalesce(t.changes_due_on, t.due_on)
                         when 'aguardando_cliente' then t.due_on else t.due_on + ceil(coalesce(w.client_wait_days, 0))::int end as d
      from public.tasks t join public.projects p on p.id = t.project_id join public.clients c on c.id = p.client_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
     where p.status not in ('cancelado','concluido') and t.status in ('solicitada','aguardando_cliente','a_fazer','em_andamento','produzido','enviado','ajustes')
       and (t.status not in ('enviado','aguardando_cliente') or not t.internal))
  select x.id, x.title, x.pname, x.cid, x.cname, x.aid, x.aname, x.amail, x.sd, x.d, (today - x.d)::int, x.st, x.wd from x where x.d < today;
end $$;
revoke execute on function public.task_delays() from public, anon, authenticated;
grant execute on function public.task_delays() to service_role;

-- métricas de prazo (só equipe). Período por data de ENTREGA (status "entregue").
create or replace function public.board_metrics(p_from date, p_to date, p_client uuid default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rv int := coalesce(app.board_days('review'), 3);
begin
  if not app.is_staff() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return (
    with base as (
      select t.id, t.area, t.status, t.due_on, t.created_at, t.completed_at, coalesce(a.full_name, 'Sem responsável') as assignee, c.id as cid, c.name as cname,
             coalesce(w.client_wait_days, 0) as wait,
             (select count(*) from public.task_events e where e.task_id = t.id and e.kind = 'status' and e.detail like '% → ajustes') as rounds
        from public.tasks t join public.projects p on p.id = t.project_id join public.clients c on c.id = p.client_id left join public.profiles a on a.id = t.assignee_id left join public.task_client_wait w on w.task_id = t.id
       where t.status <> 'cancelada' and (p_client is null or c.id = p_client)),
    done as (select *, (app.br_date(completed_at) <= due_on + ceil(wait)::int) as ok_adj, (app.br_date(completed_at) <= due_on) as ok_raw,
                    extract(epoch from (completed_at - created_at)) / 86400.0 as lead
               from base where status = 'entregue' and completed_at is not null and app.br_date(completed_at) between p_from and p_to),
    rev as (select b.cid, b.assignee, extract(epoch from (s.to_at - s.from_at)) / 86400.0 as d from public.task_status_spans s join base b on b.id = s.task_id
             where s.status = 'enviado' and not s.is_open and app.br_date(s.to_at) between p_from and p_to),
    late as (select * from public.task_delays() where p_client is null or client_id = p_client)
    select jsonb_build_object(
      'created', (select count(*) from base where app.br_date(created_at) between p_from and p_to),
      'completed', (select count(*) from done),
      'on_time_pct', (select round(100.0 * count(*) filter (where ok_adj) / nullif(count(*) filter (where due_on is not null), 0), 1) from done where due_on is not null),
      'on_time_raw_pct', (select round(100.0 * count(*) filter (where ok_raw) / nullif(count(*) filter (where due_on is not null), 0), 1) from done where due_on is not null),
      'avg_lead_days', (select round(avg(lead)::numeric, 1) from done),
      'avg_team_days', (select round(avg(greatest(lead - wait, 0))::numeric, 1) from done),
      'avg_client_days', (select round(avg(wait)::numeric, 1) from done),
      'avg_rounds', (select round(avg(rounds)::numeric, 1) from done),
      'reviews', jsonb_build_object('total', (select count(*) from rev), 'avg_days', (select round(avg(d)::numeric, 1) from rev),
                                    'within_pct', (select round(100.0 * count(*) filter (where d <= rv) / nullif(count(*), 0), 1) from rev), 'limit_days', rv),
      'late_now', jsonb_build_object('team', (select count(*) from late where side = 'equipe'), 'client', (select count(*) from late where side = 'cliente')),
      'late_list', coalesce((select jsonb_agg(jsonb_build_object('id', task_id, 'title', title, 'client', client_name, 'project', project, 'side', side, 'days', days_late, 'assignee', assignee_name, 'status', status, 'wait_days', wait_days) order by days_late desc) from (select * from late order by days_late desc limit 30) l), '[]'::jsonb),
      'by_assignee', coalesce((select jsonb_agg(r order by (r->>'completed')::int desc, r->>'name') from (
          select jsonb_build_object('name', n.nm, 'completed', coalesce(d.c, 0), 'on_time_pct', d.pct, 'avg_lead_days', d.lead, 'late_now', coalesce(l.c, 0)) r
            from (select assignee as nm from done union select coalesce(assignee_name, 'Sem responsável') from late where side = 'equipe') n
            left join (select assignee, count(*) c, round(100.0 * count(*) filter (where ok_adj) / nullif(count(*) filter (where due_on is not null), 0), 1) pct, round(avg(lead)::numeric, 1) lead from done group by assignee) d on d.assignee = n.nm
            left join (select coalesce(assignee_name, 'Sem responsável') nm, count(*) c from late where side = 'equipe' group by 1) l on l.nm = n.nm) q), '[]'::jsonb),
      'by_area', coalesce((select jsonb_agg(r order by (r->>'completed')::int desc) from (
          select jsonb_build_object('area', coalesce(area, 'outro'), 'completed', count(*), 'on_time_pct', round(100.0 * count(*) filter (where ok_adj) / nullif(count(*) filter (where due_on is not null), 0), 1), 'avg_lead_days', round(avg(lead)::numeric, 1), 'avg_client_days', round(avg(wait)::numeric, 1)) r
            from done group by coalesce(area, 'outro')) q), '[]'::jsonb),
      'by_client', case when p_client is not null then '[]'::jsonb else coalesce((select jsonb_agg(r order by (r->>'completed')::int desc) from (
          select jsonb_build_object('client', cname, 'completed', count(*), 'on_time_pct', round(100.0 * count(*) filter (where ok_adj) / nullif(count(*) filter (where due_on is not null), 0), 1), 'avg_client_days', round(avg(wait)::numeric, 1),
                                    'late_team', (select count(*) from late l where l.client_name = d.cname and l.side = 'equipe'), 'late_client', (select count(*) from late l where l.client_name = d.cname and l.side = 'cliente')) r
            from done d group by cname) q), '[]'::jsonb) end));
end $$;
revoke execute on function public.board_metrics(date, date, uuid) from public, anon;
grant execute on function public.board_metrics(date, date, uuid) to authenticated;


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
