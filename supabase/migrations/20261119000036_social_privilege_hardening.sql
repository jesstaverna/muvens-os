-- RLS não restringe TRUNCATE: remova privilégios implícitos de tabelas de integração.
revoke all on public.social_connections from PUBLIC, anon, authenticated;
grant select,insert,update,delete on public.social_connections to authenticated;
grant all on public.social_connections to service_role;

-- Metadados analíticos só podem ser lidos/modificados por usuários autorizados via RLS.
revoke truncate,trigger,references on public.social_period_metrics from authenticated;
revoke truncate,trigger,references on public.social_post_metrics from authenticated;
