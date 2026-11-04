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
