# Atualizações do banco (Supabase já existente)

Use estes arquivos quando o seu banco foi criado com as migrações 01–05 e faltam os módulos novos.

1. No SQL Editor, rode: `select to_regclass('public.contracts');`
   - **Vazio (null)** → use `A_modulos_06_a_11.sql` (Contratos, Projetos, Brand Center, Portal do Cliente, Prospecção).
   - **Retornou `contracts`** → use `B_modulos_08_a_11.sql` (Projetos, Brand Center, Portal do Cliente, Prospecção).
2. Abra o arquivo no GitHub → **Raw** → copiar tudo → colar numa nova query → **Run**. Rode **uma vez só**.
3. Conferência: `select to_regclass('public.projects') is not null, to_regclass('public.brand_assets') is not null, to_regclass('public.client_requests') is not null, to_regclass('public.prospects') is not null;` → tudo `true`.

Se aparecer erro em vermelho, não rode de novo: copie a mensagem inteira (a execução é uma transação — se falhar, nada é aplicado).

## C — Link público do diagnóstico (migração 12)

Se a integração GitHub↔Supabase não aplicou sozinha: rode `C_link_publico_diagnostico.sql` **uma vez** (pré-requisito: tabela `prospects` existente). Conferência: `select to_regprocedure('public.public_prospect_report(text)') is not null;` → `true`.

## D — Visualizações da landing e preços "a partir de" (migração 13)

Pré-requisito: migração 12 (arquivo C). Rode `D_visualizacoes_e_precos.sql` **uma vez**. Conferência: `select to_regclass('public.service_prices') is not null;` → `true`.
