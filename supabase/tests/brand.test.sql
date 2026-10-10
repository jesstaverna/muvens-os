\set ON_ERROR_STOP on
create or replace function pg_temp.expect_error(sql text, code text default null) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ESPERAVA ERRO e nada ocorreu: %', sql;
exception when others then
  if sqlerrm like 'ESPERAVA ERRO%' then raise; end if;
  if code is not null and sqlstate <> code then raise exception 'Erro % diferente de %: % (sql: %)', sqlstate, code, sqlerrm, sql; end if;
end $$;

-- designer monta a marca
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
insert into brand_profiles (client_id, tone_of_voice, design_rules, restrictions, ai_instructions)
  values ('11111111-1111-1111-1111-111111111111', 'Acolhedor e direto', 'Usar bastante espaço em branco', 'Nunca usar o logo sobre foto escura', 'Não prometer prazos; sempre citar o diferencial artesanal');
insert into brand_colors (client_id, name, hex, role, position) values ('11111111-1111-1111-1111-111111111111', 'Verde Aurora', '#1A7F5A', 'primaria', 0), ('11111111-1111-1111-1111-111111111111', 'Off-white', '#F7F7F4', 'neutra', 1);
select pg_temp.expect_error($$insert into brand_colors (client_id, name, hex) values ('11111111-1111-1111-1111-111111111111', 'Inválida', 'verde')$$, '23514');
select pg_temp.expect_error($$insert into brand_links (client_id, label, url) values ('11111111-1111-1111-1111-111111111111', 'x', 'javascript:alert(1)')$$, '23514');
insert into brand_links (client_id, kind, label, url) values ('11111111-1111-1111-1111-111111111111', 'figma', 'Design system', 'https://www.figma.com/file/abc');
insert into brand_fonts (client_id, name, usage) values ('11111111-1111-1111-1111-111111111111', 'Helvetica Neue', 'titulo');
insert into brand_assets (client_id, category, name, tags, path, size, mime, downloadable) values
  ('11111111-1111-1111-1111-111111111111', 'logo', 'Logo principal', array['positivo','svg'], '11111111-1111-1111-1111-111111111111/logo.svg', 1200, 'image/svg+xml', true),
  ('11111111-1111-1111-1111-111111111111', 'brandbook', 'Brandbook v2', array['pdf'], '11111111-1111-1111-1111-111111111111/brandbook.pdf', 900000, 'application/pdf', false);
select pg_temp.expect_error($$insert into brand_assets (client_id, category, name, path) values ('11111111-1111-1111-1111-111111111111', 'inexistente', 'x', 'p1')$$, '23514');
select pg_temp.expect_error($$insert into brand_assets (client_id, category, name, path) values ('11111111-1111-1111-1111-111111111111', 'logo', 'dup', '11111111-1111-1111-1111-111111111111/logo.svg')$$, '23505');
do $$ declare k jsonb; begin
  k := public.brand_knowledge('11111111-1111-1111-1111-111111111111');
  assert k->>'client' = 'Studio Aurora' and k->>'tone_of_voice' = 'Acolhedor e direto', 'base de conhecimento: tom de voz';
  assert jsonb_array_length(k->'colors') = 2 and k->'colors'->0->>'hex' = '#1A7F5A', 'base de conhecimento: paleta ordenada';
  assert jsonb_array_length(k->'assets') = 2 and jsonb_array_length(k->'links') = 1 and k->>'ai_instructions' like '%diferencial artesanal%', 'base de conhecimento completa';
end $$;
reset role;

-- tráfego lê, não escreve; financeiro não vê; anon não vê
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin assert (select count(*) from brand_colors) = 0 and (select count(*) from brand_assets) = 0, 'financeiro não vê o brand center'; end $$;
reset role;
update profiles set role = 'trafego' where email = 'financeiro@muvens.test';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ declare n int; begin
  assert (select count(*) from brand_colors) = 2, 'tráfego lê as regras da marca';
  update brand_profiles set tone_of_voice = 'x'; get diagnostics n = row_count; assert n = 0, 'tráfego não altera a marca';
end $$;
select pg_temp.expect_error($$insert into brand_colors (client_id, name, hex) values ('11111111-1111-1111-1111-111111111111', 'x', '#000000')$$, '42501');
reset role;
update profiles set role = 'financeiro' where email = 'financeiro@muvens.test';
set role anon;
select pg_temp.expect_error($$select * from brand_assets$$, '42501');
reset role;
