# MUVENS OS — Arquitetura e plano

> Estado desta entrega: **Fase 1 implementada e testada** (ver §8 e `README.md`). Fases 2–4 estão especificadas aqui, mas **não construídas**; as telas correspondentes dizem isso explicitamente.

## 1. Arquitetura técnica

```
 Navegador ──► Next.js 15 (App Router, TS, Tailwind) ──► Supabase
 (equipe, link         │  Server Components + Server Actions     ├─ PostgreSQL  (dados, RLS, funções, triggers)
  público, portal)     │  (sessão do usuário → RLS)               ├─ Auth        (login, JWT)
                       │                                          └─ Storage     (buckets PRIVADOS, URLs assinadas)
                       ├─ /p/[token]      link público: só RPCs "security definer", sem acesso a tabelas
                       ├─ /api/worker     processador de fila (service role, protegido por CRON_SECRET)
                       └─ /api/health     monitoramento

 Agendador externo (Vercel Cron │ pg_cron+pg_net │ n8n) ──GET/POST a cada 5 min──► /api/worker   → automações 24/7
 Integrações (Fase 3): RD Station/RD Conversas, Clicksign/ZapSign, Meta/Google Ads, Asaas → webhooks em /api/webhooks/* + handlers do worker
 IA (Fase 4): Claude API chamada SOMENTE no servidor, com o JWT do usuário (herda RLS) e ferramentas de leitura
```

Decisões-chave

| Decisão | Motivo |
|---|---|
| **Regras no banco** (constraints, triggers, RLS, funções) e UI fina | Garantem integridade e segurança independentemente de quem chama (UI, worker, integração, IA). Testadas em SQL real. |
| **RLS por perfil** + papéis `admin/comercial/financeiro/designer/trafego/cliente` | Isolamento de dados financeiros e entre clientes; o navegador nunca recebe chave privilegiada. |
| **Server Actions** para toda escrita | Sem API REST paralela para manter; validação com Zod; feedback via `?ok=/?err=`. |
| **Fila `jobs` no Postgres** (`FOR UPDATE SKIP LOCKED`, backoff exponencial, `dead` após 5 tentativas, recuperação de jobs travados) | 24/7 sem depender do navegador nem de infraestrutura extra; trocar por n8n/Queue depois não muda o contrato. |
| **Link público via RPC** | `anon` não lê tabelas; só chama `proposal_public_open/accept/request_changes` com token de 256 bits. |
| Texto+CHECK no lugar de ENUM | Migrações mais simples. |
| Datas de negócio em `America/Sao_Paulo` (`app.br_date`) | Evita deslocar dia/mês de faturamento. |
| 3 ambientes = 3 projetos Supabase (dev/homolog/prod) + `.env` por ambiente | `supabase/migrations/` é a única fonte do schema. |

Pastas: `src/app/(app)/<módulo>` (página + `actions.ts`), `src/components` (UI reutilizável), `src/lib` (regras puras testáveis, clientes Supabase, permissões, worker), `supabase/migrations`, `supabase/tests`.

## 2. Mapa de páginas

| Rota | Módulo | Perfis | Status |
|---|---|---|---|
| `/login`, `/sem-acesso` | Autenticação | todos | ✅ |
| `/dashboard`, `/alertas` | Dashboard executivo + alertas | equipe | ✅ (finanças só admin/financeiro) |
| `/crm`, `/crm/novo`, `/crm/[id]` | CRM (Kanban/Lista/Calendário) | admin, comercial | ✅ |
| `/clientes`, `/clientes/novo`, `/clientes/[id]` | Clientes (visão 360°) | equipe (edição: admin/comercial/financeiro) | ✅ (projetos/docs/campanhas: Fase 2–3) |
| `/propostas`, `/propostas/nova`, `/propostas/[id]`, `/propostas/[id]/preview` | Propostas | admin, comercial (financeiro lê) | ✅ |
| `/p/[token]` | Proposta pública (aceite / pedir alterações / PDF) | público com token | ✅ |
| `/financeiro` (abas) | Lançamentos, a receber, a pagar, recorrências/assinaturas, comprovantes | admin, financeiro | ✅ |
| `/metas` | Metas e projeções | admin (edita), comercial/financeiro (lê) | ✅ |
| `/automacoes` | Fila, falhas, última varredura | admin | ✅ |
| `/configuracoes` | Usuários/perfis, etapas do funil, integrações, auditoria | admin | ✅ |
| `/contratos`, `/contratos/[id]`, `/contratos/modelos` | Contratos: rascunho automático ao aceitar a proposta, revisão humana obrigatória, assinatura (manual; Clicksign/ZapSign pendentes), modelos e dados da agência | admin, comercial (financeiro lê) | ✅ (Fase 2) |
| `/atendimento-ia` | MUVENS AI — Atendimento Comercial (RD Conversas) | admin, comercial | ⏳ Fase 3 (integração pendente) |
| `/projetos`, `/projetos/novo`, `/projetos/[id]`, `/projetos/tarefas/nova`, `/projetos/tarefas/[id]` | Projetos e tarefas: Kanban, lista, por cliente, entregáveis contratados, fluxo de aprovação, horas, checklist, comentários, arquivos, histórico, rentabilidade (admin/financeiro) | equipe (financeiro lê) | ✅ (Fase 2) |
| `/calendario` | Calendário de produção (mês, filtros) | equipe | ✅ (Fase 2) |
| `/brand`, `/brand/[id]` | Brand Center: paleta, fontes, links, arquivos privados (busca, categorias, download autorizado), regras/tom de voz, base de conhecimento para a IA | admin, comercial, designer (escrita); tráfego lê | ✅ (Fase 2) |
| `/portal` | Portal do Cliente | cliente | ⏳ Fase 2 (próxima etapa) |
| `/trafego` | Meta/Google Ads | admin, tráfego | ⏳ Fase 3 |
| `/relatorios` `/ia` | Relatórios e MUVENS AI executiva | vários | ⏳ Fase 4 |

## 3. Estrutura do banco (Fase 1)

`profiles` (role, client_id) · `clients`, `client_contacts`, `client_services` (fonte do MRR) · `pipeline_stages`, `leads`, `lead_interactions`, `lead_reminders` · `proposals`, `proposal_items`, `proposal_versions`, `proposal_events` · `fin_categories`, `fin_recurring`, `fin_transactions` · `goals` · `jobs`, `notifications`, `audit_log`.

Regras no banco (todas cobertas por `supabase/tests/rules.test.sql`):
- Lead: e-mail/telefone normalizados e **únicos** (`+55 (11) 98888-7777` = `11988887777`); contato obrigatório; **motivo da perda** obrigatório ao mover para “Não Fechado”; `last_contact_at` atualizado por interações.
- Proposta: totais recalculados por trigger (`pontual + mensal × vigência − desconto`); **desconto só por admin**, registrando `discount_authorized_by`; versões imutáveis (`proposal_snapshot`); eventos de visualização/aceite/alteração com IP; ao aceitar → cliente criado do lead, lead → “Fechado”, job `proposal.accepted`, alerta.
- Financeiro: `previsto → emitido → liquidado`; liquidar exige data/valor; recorrências idempotentes (`unique(recurring_id, competence)`); `activate_proposal` (admin/financeiro) gera serviços, parcelas pontuais (centavos na última) e mensalidades.
- Perfis: só admin muda papel/ativação (`guard_profile`); primeiro usuário vira admin, demais entram **sem acesso**.
- Auditoria (`audit_log`) em perfis, clientes, serviços, leads, propostas, lançamentos e metas.

Fases 2–4 (já planejadas, sem tabelas ainda): `contracts`, `contract_templates`, `projects`, `tasks`, `task_comments`, `time_entries`, `deliverable_plans`, `brand_assets`, `brand_rules`, `portal_*`, `ad_accounts`, `ad_metrics_daily`, `integration_accounts` (tokens **criptografados**), `webhook_events`, `ai_conversations`, `ai_runs`.

## 4. Relacionamentos entre módulos

```
lead ──(proposta aceita)──► client ◄── client_contacts
  │                           │ ├── client_services ──► MRR (dashboard/metas)
  └─► proposals ──items       │ ├── fin_transactions (proposal_id, client_id, recurring_id)
        │  versions/events    │ ├── [F2] contracts → projects → tasks/time_entries/deliverables
        └─ activate_proposal ─┘ ├── [F2] brand_assets
                                └── [F3] ad_accounts → ad_metrics_daily
goals ◄── dashboard_metrics() ◄── propostas + lançamentos + serviços + funil
```
Um único cadastro de cliente; todos os módulos referenciam `clients.id`.

## 5. Fluxos de automação (24/7)

Gatilhos no banco (instantâneos, transacionais) → enfileiram `jobs`/`notifications`; o worker (a cada 5 min) processa a fila e roda a varredura horária `run_scheduled_scans()`.

| Automação | Estado |
|---|---|
| Novo lead → job + notificação ao responsável (ou ao time comercial) | ✅ |
| Proposta enviada → lead vai para “Proposta Enviada” | ✅ |
| Proposta aceita → cliente criado, lead “Fechado”, job `proposal.accepted`, alerta “preparar contrato” | ✅ (geração do contrato: Fase 2) |
| Pagamento em atraso → alerta crítico (1 por lançamento) | ✅ |
| Oportunidade sem contato há 3+ dias / proposta parada há 5+ dias → alerta semanal | ✅ |
| Lembretes vencidos → notificação | ✅ |
| Propostas vencidas → status “Expirada” | ✅ |
| Despesas fixas/assinaturas do mês → geradas automaticamente | ✅ |
| Contrato assinado → cliente ativo + serviços + recebíveis previstos + job `contract.signed` | ✅ (projeto/onboarding: com o módulo de Projetos) |
| Contrato perto do vencimento / reajuste (30 dias) → alerta | ✅ |
| Contrato assinado → projeto de onboarding com 4 tarefas genéricas | ✅ |
| Tarefa atrasada → alerta ao responsável (semanal por tarefa) | ✅ |
| Tarefa/entregável acima da quantidade contratada → marcada “fora do escopo” | ✅ |
| Campanha crítica (CPL↑, conversões↓, orçamento) | ⏳ Fase 3 |
| Cliente sem contato → sugerir follow-up com IA | ⏳ Fase 4 |

Falhas: retentativa com backoff 1,2,4,8 min; após 5 tentativas → `dead` (visível em `/automacoes`). Jobs “running” travados por >10 min são recuperados.

## 6. Estratégia de integrações

Princípios: (1) **nada é marcado como conectado sem uma chamada real bem-sucedida**; (2) credenciais só no servidor (env/`integration_accounts` criptografado); (3) todo webhook entra por `/api/webhooks/<provedor>` → valida assinatura → grava em `webhook_events` (idempotente) → job; (4) cada provedor isolado em `src/integrations/<nome>` implementando a mesma interface (`connect`, `sync`, `handleWebhook`); (5) idempotência por `external_ref`.

| Integração | Plano | Dependência externa (pendente) |
|---|---|---|
| RD Station Marketing | OAuth2 + webhooks de conversão → `leads` (dedupe pelas chaves normalizadas) | Conta/plano, client id/secret |
| **RD Conversas** (agente de IA nativo) | O agente atende no WhatsApp; MUVENS OS recebe eventos (lead qualificado, transferência) e registra no CRM; regras de transferência e política de janela 24h/templates ficam **configuradas no RD**, respeitando consentimento | **Assinatura do RD Conversas — ainda não contratada.** Os recursos de API dependem do plano; confirmar na documentação oficial antes de construir |
| Clicksign / ZapSign | Criar documento → enviar → webhook de status → dispara onboarding | Conta + token |
| Meta Ads / Google Ads | Sync diário de métricas → `ad_metrics_daily`; investimento do cliente **separado** da receita da agência | App/tokens, acesso às contas dos clientes (Google exige developer token aprovado) |
| Asaas | Criar cobrança a partir de `fin_transactions`, webhook de pagamento → `liquidado` | Chave de API |
| MUVENS AI (Claude) | Tool-use somente leitura com o JWT do usuário (RLS); ações críticas viram **rascunho para aprovação humana** | `ANTHROPIC_API_KEY` |

## 7. Dependências, riscos e custos previstos

Custos (ordem de grandeza — **confirmar nos sites oficiais; preços mudam**): Supabase (Pro ≈ US$25/mês por projeto; homologação pode usar plano gratuito), hospedagem Next.js (Vercel Pro ≈ US$20/usuário/mês, ou Railway/Fly), domínio, **RD Conversas** (assinatura a contratar), Clicksign/ZapSign (por plano/documento), Asaas (taxa por cobrança), Claude API (por token; controlável por limites), monitoramento (UptimeRobot grátis).

Riscos e mitigação
- **Credenciais/permissões de terceiros** (Meta/Google/RD): aprovação de app pode levar semanas → iniciar cedo.
- **WhatsApp**: opt-in, janela de 24h, templates aprovados; qualquer automação ativa deve usar templates e consentimento registrado (LGPD).
- **IA e promessas comerciais**: prompt do agente proíbe preços/prazos; proposta nunca é preenchida com preços automaticamente (já aplicado nos modelos).
- **Dados financeiros**: RLS + auditoria; revisar políticas a cada nova tabela (checklist em `docs/DEPLOY.md`).
- **Limite de tempo de execução do worker** (serverless): lotes de 20 jobs; se crescer, mover para worker dedicado/n8n.
- **Signup aberto no Supabase**: desativar; usuários por convite.
- **Probabilidades do funil** são estimativas editáveis, não dados históricos — calibrar com resultados reais.
- Backups: Supabase Pro inclui backups diários; PITR opcional. Testar restauração trimestralmente.

## 8. Plano de implementação

| Fase | Escopo | Estado |
|---|---|---|
| **1 — Fundação e gestão** | Auth/perfis/RLS, dashboard, clientes, CRM, propostas (link público, aceite, versões, PDF por impressão), financeiro (recorrências, parcelas, comprovantes), metas, fila de automações/alertas, auditoria | ✅ implementada; ver testes no README |
| **2 — Operação** | Contratos (modelos, rascunho + revisão humana, preparação p/ assinatura), projetos/tarefas/horas/entregáveis/escopo extra, calendário, Brand Center (storage privado), Portal do Cliente | ⏳ próxima |
| **3 — Integrações** | RD Station/Conversas, assinatura eletrônica, Meta/Google Ads + alertas, Asaas | ⏳ depende de contas |
| **4 — Inteligência** | MUVENS AI executiva (consulta com RLS, resumo diário, rascunhos de proposta), relatórios, previsão | ⏳ |

Limitações conhecidas da Fase 1: exportação em PDF usa “Imprimir → Salvar como PDF” do navegador (sem gerador no servidor); notificações são in-app (sem e-mail/WhatsApp até a Fase 3); “visualizada” não distingue múltiplos visitantes do mesmo link; uma notificação compartilhada (sem destinatário) é marcada como lida para todos.
