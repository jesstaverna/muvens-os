# MUVENS OS

Sistema de gestão da **MUVENS AGÊNCIA** — CRM, propostas online, clientes, financeiro, metas e automações 24/7 sobre Next.js + Supabase (PostgreSQL com RLS).

**Estado:** Fase 1 (fundação e gestão) implementada e testada. Fases 2–4 planejadas; as telas dessas fases exibem “não implementado” — nada é simulado. Detalhes, mapa de páginas, modelo de dados, fluxos, integrações, custos e riscos: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Publicação e operação: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## O que existe (Fase 1)
Login e perfis (admin, comercial, financeiro, designer, tráfego, cliente) com RLS · Dashboard com dados reais e filtros (mês, período, cliente) · CRM (Kanban com arrastar, lista, calendário; anti-duplicidade; motivo de perda; lembretes) · Clientes (visão 360°) · Propostas (escolha do serviço + briefing: sobre o cliente, expectativas e resultados; modelos, itens, desconto autorizado por admin, versões, link exclusivo, aceite/pedido de alteração, PDF por impressão, histórico) · Financeiro (previsto/emitido/recebido, parcelas, recorrências e assinaturas, inadimplência, comprovantes privados) · Metas e projeções · Fila de automações + worker + alertas · Auditoria.

Fase 2 (parcial): **Contratos** — rascunho automático ao aceitar a proposta, revisão humana obrigatória (bloqueia aprovação com `[PREENCHER]`), texto travado após aprovar, assinatura registrada manualmente (admin) que ativa cliente e financeiro, alertas de vencimento/reajuste.

Fase 2 (parcial): **Projetos e Tarefas** (Kanban, lista, calendário de produção, entregáveis contratados com contagem de iniciados/produzidos/enviados/aprovados/entregues, fluxo de aprovação sem pular etapas, fora do escopo automático, apontamento de horas, checklist, comentários, arquivos privados, histórico, rentabilidade por cliente com custo/hora) e onboarding automático ao assinar contrato.

Fase 2 (parcial): **Brand Center / KV** — por cliente: paleta, tipografia, links Figma/Drive, arquivos em bucket privado (10 categorias, tags, busca, miniaturas, download autorizado — arquivos restritos só o administrador baixa), regras de design, restrições, tom de voz e instruções para a IA, com uma base de conhecimento pronta para a Fase 4 (texto copiável hoje).

Fase 2 (parcial): **Portal do Cliente** (`/cliente`) — login individual, cada cliente vê só a própria empresa: projetos e tarefas liberados pela equipe, aprovação ou pedido de ajustes de peças (registrado no histórico e avisado à equipe), calendário de entregas, briefings e solicitações com resposta, documentos/arquivos finais/relatórios, propostas e contratos. Gestão em `/portal`. Menu lateral agrupado por área.

**Prospecção** (Fase 3, estrutura): campanhas por nicho/cidade no Google Maps, análise de site e presença digital com dados públicos, pontuação de oportunidade, rascunhos de e-mail/WhatsApp, e-mail com aprovação, limites, follow-up, bloqueio e descadastro. WhatsApp assistido (sem disparo automático). Google Places e envio de e-mail dependem de chaves (pendentes).

**Pendente / não conectado:** RD Station, RD Conversas (sem assinatura), Clicksign/ZapSign, Meta/Google Ads, Asaas, IA (Fases 3–4); assinatura eletrônica (Clicksign/ZapSign); relatórios de desempenho automáticos e assinatura pelo próprio portal (dependem das integrações da Fase 3).

## Rodando
```bash
cp .env.example .env.local      # preencha com um projeto Supabase (aplique supabase/migrations/*.sql)
npm install
npm run dev
```

## Testes (executados nesta entrega)
| Camada | Comando | O que cobre |
|---|---|---|
| Regras puras | `npm test` | normalização, totais, parcelas, metas/projeção, datas |
| Banco | `npm run test:db` | migrações + constraints, RLS por perfil, fluxo lead→proposta→aceite→ativação→financeiro, métricas, recorrência, fila/backoff/dead, varreduras |
| Consultas das páginas | `node supabase/tests/api_smoke.mjs` | 43 verificações via PostgREST real (embeds, RPCs, permissões, link público) |
| Worker | `PGRST_URL=… npx vitest run` | processamento de fila, idempotência, falha com retentativa |
| Build | `npm run typecheck && npm run build` | TypeScript e build de produção |

**Não testado:** fluxo completo no navegador contra um Supabase hospedado (Auth/GoTrue, Storage e Cron reais). O ambiente de desenvolvimento não tinha um projeto Supabase; valide em homologação seguindo `docs/DEPLOY.md`.

> Banco: as migrações em `supabase/migrations/` são aplicadas pela integração GitHub↔Supabase (Working directory `.`, branch `main`). Não execute `supabase/setup.sql` junto com a integração.
