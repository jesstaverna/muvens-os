-- MUVENS OS — 0005 Segurança: RLS por perfil, privilégios mínimos, storage privado

-- Privilégios: nada para anon em tabelas; authenticated sob RLS; service_role (servidor) ignora RLS.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon;

-- Funções: por padrão ninguém executa; liberamos explicitamente.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.proposal_public_open(text), public.proposal_public_accept(text, text, text),
                          public.proposal_public_request_changes(text, text, text) to anon, authenticated;
grant execute on function public.dashboard_metrics(date, date, uuid), public.finance_monthly_series(int), public.crm_conversion(date, date),
                          public.generate_recurring(date), public.activate_proposal(uuid, date), public.proposal_snapshot(uuid, text) to authenticated;
grant execute on function public.claim_jobs(int), public.finish_job(uuid, text), public.run_scheduled_scans() to service_role;
-- funções app.* de autorização precisam ser chamáveis por anon dentro das policies/triggers do link público
grant execute on function app.client_ip(), app.br_date(timestamptz), app.norm_email(text), app.norm_phone(text), app.has_role(text[]), app.user_role() to anon;
grant execute on function app.notify(text, text, text, text, text, uuid, text), app.enqueue_job(text, jsonb, timestamptz, text) to anon;

-- Habilita RLS em tudo
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or app.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- audit_log / jobs: somente admin lê; escrita só via triggers/funções definer e service role
create policy audit_select on public.audit_log for select to authenticated using (app.has_role('admin'));
create policy jobs_select on public.jobs for select to authenticated using (app.has_role('admin'));

-- notifications: equipe vê as endereçadas a ela, ao seu papel ou a todos
create policy notif_select on public.notifications for select to authenticated
  using (app.is_staff() and (user_id = auth.uid() or (user_id is null and (audience is null or audience = app.user_role()))));
create policy notif_update on public.notifications for update to authenticated
  using (app.is_staff() and (user_id = auth.uid() or (user_id is null and (audience is null or audience = app.user_role()))))
  with check (app.is_staff());

-- clientes (designer/tráfego precisam enxergar; edição por admin/comercial/financeiro)
create policy clients_select on public.clients for select to authenticated using (app.is_staff() or id = app.current_client_id());
create policy clients_write on public.clients for all to authenticated
  using (app.has_role('admin','comercial','financeiro')) with check (app.has_role('admin','comercial','financeiro'));
create policy contacts_select on public.client_contacts for select to authenticated using (app.is_staff());
create policy contacts_write on public.client_contacts for all to authenticated
  using (app.has_role('admin','comercial','financeiro')) with check (app.has_role('admin','comercial','financeiro'));
create policy cservices_select on public.client_services for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy cservices_write on public.client_services for all to authenticated
  using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));

-- CRM
create policy stages_select on public.pipeline_stages for select to authenticated using (app.is_staff());
create policy stages_write on public.pipeline_stages for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));
create policy leads_all on public.leads for all to authenticated
  using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy interactions_all on public.lead_interactions for all to authenticated
  using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy reminders_all on public.lead_reminders for all to authenticated
  using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));

-- propostas (financeiro só lê)
create policy proposals_select on public.proposals for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy proposals_write on public.proposals for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy pitems_select on public.proposal_items for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy pitems_write on public.proposal_items for all to authenticated using (app.has_role('admin','comercial')) with check (app.has_role('admin','comercial'));
create policy pversions_select on public.proposal_versions for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy pversions_insert on public.proposal_versions for insert to authenticated with check (app.has_role('admin','comercial'));
create policy pevents_select on public.proposal_events for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy pevents_insert on public.proposal_events for insert to authenticated with check (app.has_role('admin','comercial'));

-- financeiro
create policy fincat_select on public.fin_categories for select to authenticated using (app.has_role('admin','financeiro','comercial'));
create policy fincat_write on public.fin_categories for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));
create policy finrec_all on public.fin_recurring for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));
create policy fintx_all on public.fin_transactions for all to authenticated using (app.has_role('admin','financeiro')) with check (app.has_role('admin','financeiro'));

-- metas
create policy goals_select on public.goals for select to authenticated using (app.has_role('admin','comercial','financeiro'));
create policy goals_write on public.goals for all to authenticated using (app.has_role('admin')) with check (app.has_role('admin'));

-- ---------- storage privado (comprovantes) — só existe no Supabase ----------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('finance-receipts', 'finance-receipts', false) on conflict (id) do nothing;
    execute $p$create policy "finance receipts read" on storage.objects for select to authenticated
      using (bucket_id = 'finance-receipts' and app.has_role('admin','financeiro'))$p$;
    execute $p$create policy "finance receipts write" on storage.objects for insert to authenticated
      with check (bucket_id = 'finance-receipts' and app.has_role('admin','financeiro'))$p$;
    execute $p$create policy "finance receipts delete" on storage.objects for delete to authenticated
      using (bucket_id = 'finance-receipts' and app.has_role('admin','financeiro'))$p$;
  end if;
end $$;
