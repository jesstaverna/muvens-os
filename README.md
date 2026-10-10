# MUVENS OS

Sistema de gestão da **MUVENS AGÊNCIA** — CRM, propostas online, clientes, financeiro, metas e automações 24/7 sobre Next.js + Supabase (PostgreSQL com RLS).

**Estado:** Fase 1 (fundação e gestão) implementada e testada. Fases 2–4 planejadas; as telas dessas fases exibem “não implementado” — nada é simulado. Detalhes, mapa de páginas, modelo de dados, fluxos, integrações, custos e riscos: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Publicação e operação: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## O que existe (Fase 1)
Login e perfis (admin, comercial, financeiro, designer, tráfego, cliente) com RLS · Dashboard com dados reais e filtros (mês, período, cliente) · CRM (Kanban com arrastar, lista, calendário; anti-duplicidade; motivo de perda; lembretes) · Clientes (visão 360°) · Propostas (modelos, itens, desconto autorizado por admin, versões, link exclusivo, aceite/pedido de alteração, PDF por impressão, histórico) · Financeiro (previsto/emitido/recebido, parcelas, recorrências e assinaturas, inadimplência, comprovantes privados) · Metas e projeções · Fila de automações + worker + alertas · Auditoria.

**Pendente / não conectado:** RD Station, RD Conversas (sem assinatura), Clicksign/ZapSign, Meta/Google Ads, Asaas, IA (Fases 3–4); contratos, projetos, Brand Center, portal (Fase 2).

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
