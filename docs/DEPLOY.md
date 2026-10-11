# Deploy e operação

## 1. Ambientes
Crie **3 projetos Supabase** (dev, homologação, produção) e 3 deploys do app, cada um com seu `.env` (veja `.env.example`). O schema vem **somente** de `supabase/migrations/` (aplicar na ordem com `supabase db push` ou colando no SQL Editor).

## 2. Primeiro acesso
1. Aplicar as migrações de `supabase/migrations/` (automático pela integração GitHub↔Supabase após o merge na branch configurada, ou manualmente via `supabase db push` / `supabase/setup.sql`; **use apenas um dos caminhos**).
2. Supabase → Authentication → **desativar “Allow new users to sign up”** e criar o primeiro usuário (convite). **O primeiro usuário vira Administrador**; os demais entram sem acesso até o admin definir o perfil em *Configurações*.
3. Definir variáveis no host: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**somente servidor**), `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
4. Configurar “Site URL” e redirects do Auth para o domínio do app.

## 3. Automações 24/7 (obrigatório)
O worker é `GET/POST /api/worker` com `Authorization: Bearer $CRON_SECRET`. Escolha **um** agendador externo (a cada 5 min):

- **Vercel Cron** (`vercel.json`, já incluído; roda **1x por dia** porque o plano Hobby só permite cron diário — com plano Pro dá para usar `*/5 * * * *`). A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente quando `CRON_SECRET` está definido. **Para automações a cada 5 min no plano gratuito, use o `pg_cron` abaixo.**
- **Supabase `pg_cron` + `pg_net`** (independe do host do app):
  ```sql
  select cron.schedule('muvens-worker', '*/5 * * * *', $$
    select net.http_post(url := 'https://SEU-APP/api/worker', headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'));
  $$);
  ```
- n8n/Cron externo chamando a mesma URL.

Verificação: `/automacoes` mostra “Última varredura”. Monitore `/api/health` (UptimeRobot/BetterStack).

## 4. Segurança e LGPD — checklist
- [x] RLS em todas as tabelas; `anon` sem acesso a tabelas (link público só por RPC); service role só no servidor.
- [x] Auditoria (`audit_log`) das tabelas sensíveis; comprovantes em bucket privado com URL assinada de 60 s.
- [x] Cabeçalhos de segurança (HSTS, X-Frame-Options, nosniff, Referrer-Policy).
- [ ] **A cada nova tabela**: habilitar RLS, escrever policies por perfil, adicionar teste em `rules.test.sql`.
- [ ] LGPD: definir base legal e política de retenção para leads (dados pessoais), registrar consentimento de WhatsApp (Fase 3), canal de atendimento ao titular, DPA com operadores (Supabase, hospedagem, RD, IA).
- [ ] Backups: ativar backups diários (Pro) e testar restauração.
- [ ] MFA para administradores (Supabase Auth).

## 5. Testes
```bash
npm test                         # unitários (regras puras)
npm run test:db                  # migrações + RLS + fluxos no PostgreSQL local (descartável)
PGRST_URL=http://127.0.0.1:3111 npx vitest run       # + worker contra PostgREST local
PGRST_URL=http://127.0.0.1:3111 node supabase/tests/api_smoke.mjs   # consultas das páginas contra PostgREST local
```
PostgREST local: ver cabeçalho de `supabase/tests/api_smoke.mjs`.

```bash
npm run build && npm run test:pages   # abre ~78 páginas logado como cada perfil (admin, comercial, financeiro, designer, cliente); falha se alguma der erro 500
```
Requer o PostgREST local de pé (porta 3111) e as portas 3098/3099 livres. Detecta erros de renderização no servidor (ex.: passar um ícone/função a um componente de cliente).
