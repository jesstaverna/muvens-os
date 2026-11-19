# MUVENS OS — Início Executivo + Desempenho das Redes

## Navegação
- O item de menu **INÍCIO** aponta para /inicio e fica sempre visível aos perfis internos.
- A rota / redireciona para /inicio.
- O dashboard financeiro e comercial detalhado continua disponível em /dashboard.
- O logotipo da navegação retorna a /inicio.
- Marketing > Desempenho das Redes permite registrar indicadores com acesso limitado a Admin, Comercial e Tráfego.

## Início: o que exibe
- Quatro indicadores de operação: minhas tarefas, solicitações pendentes de triagem, tarefas vencidas e projetos ativos.
- Últimas tarefas da agência (independentemente do responsável), incluindo o projeto MUVENS interno, com padrão #00001 [CLIENTE] Título.
- Próximas atividades cadastradas no calendário de marketing.
- Redes sociais da Muvens: alcance por plataforma, soma de interações, cliques em links e três posts de maior alcance no mês.
- Comercial: negociações em andamento, pipeline ponderado, leads e propostas.
- Financeiro: recebido, recorrência (MRR), contas a receber e saldo operacional.
- Respeita permissões do papel. Não exibe receitas ao cliente externo nem aos perfis sem autorização.

## Métricas reais e limites
- Tabelas em supabase/migrations/20261119000034_social_performance.sql, com políticas RLS de equipe.
- Atualmente os relatórios de Instagram, Facebook e LinkedIn são informados manualmente, usando dados coletados nas respectivas plataformas.
- A página /social-insights registra indicadores mensais por rede e métricas individualizadas dos posts.
- Sem relatório, indicadores mostram “—” ou “Sem dados”; não são fabricados.
- Alcance somado entre redes **não é audiência única**. Visualizações, alcance e interações são métricas distintas.
- Sincronização automática exigirá credenciais de API/autorização e projeto específico; não está implementada nesta PR.

## Verificação antes de publicar
1. Em /inicio, conferir menus, números de tarefas e acesso ao dashboard detalhado.
2. Com o admin MUVENS, acessar a tarefa #00001 e validar que aparece em Tarefas recentes.
3. Inserir métricas e um post de teste **em homologação**. Conferir se o ranking mostra os valores corretos, por data e por rede.
4. Testar perfis admin, comercial, financeiro, designer, tráfego e cliente; conferir RLS e dados ocultos.
5. Validar build e navegação do preview; mesclar branches dependentes somente depois da homologação.

## Deploy
Esta branch parte de feature/numeracao-tarefas-muvens, que depende da Central de Solicitações e dos Diagnósticos. Se as PRs anteriores ainda não foram integradas, verificar a ordem das mesclagens.
