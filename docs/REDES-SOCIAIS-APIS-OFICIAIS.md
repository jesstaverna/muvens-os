# MUVENS OS · Integração oficial Instagram, Facebook e LinkedIn

Esta implementação elimina a dependência de Metricool. Utiliza OAuth das APIs oficiais, tokens cifrados no servidor (AES-256-GCM), Supabase RLS e uma rotina de sincronização diária na Vercel.

**Status atual:** estrutura implementada na branch, mas **nenhuma conta foi autorizada ainda**; os aplicativos oficiais, credenciais de servidor e aprovação de permissões são pré-requisitos. O preview da Vercel pode demonstrar a interface sem segredos; não use credenciais de produção em previews não revisados.

## 1. Domínio e callbacks

Domínio de produção encontrado na Vercel: https://muvens-os.vercel.app

Cadastrar **exatamente** estas URLs nos aplicativos oficiais (somente depois de a branch ser aprovada e publicada em produção):

- Meta: \`https://muvens-os.vercel.app/api/social/oauth/meta/callback\`
- LinkedIn: \`https://muvens-os.vercel.app/api/social/oauth/linkedin/callback\`

Configurar o mesmo domínio, sem barra final, em \`SOCIAL_OAUTH_BASE_URL\`. O código recusa iniciar o OAuth de um host diferente do configurado para evitar cookies e redirecionamentos inconsistentes.

## 2. Meta for Developers: Instagram + Facebook

1. Criar aplicativo Meta para a MUVENS em https://developers.facebook.com/apps/.
2. Configurar Facebook Login para Empresas e os redirects OAuth.
3. Solicitar apenas permissões para leitura: \`pages_show_list\`, \`pages_read_engagement\`, \`read_insights\`, \`instagram_basic\`, \`instagram_manage_insights\`. Os nomes e produtos efetivamente liberados dependem da versão e do fluxo escolhidos no painel do app.
4. Conta Instagram precisa ser **profissional** e vinculada a uma **Página do Facebook** com acesso apropriado.
5. No MUVENS OS, abrir **Configurações → Integrações → Conectar redes sociais**, clicar **Autorizar com Meta**, autorizar e **selecionar explicitamente a Página MUVENS**. Não conectar outras marcas pessoais ou dos clientes.
6. A Página Facebook e o Instagram profissional vinculado são registrados como conexões independentes; tokens cifrados no servidor.

Se a Meta exigir verificação empresarial ou App Review para permissões avançadas, concluir a revisão antes de tentar conectar contas sem função no app. Não criar token manual e não enviá-lo por chat.

Referências:
- https://developers.facebook.com/docs/insights/overview
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api

## 3. LinkedIn Developers

1. Criar um aplicativo associado à Página Empresarial da MUVENS em https://www.linkedin.com/developers/apps.
2. Solicitar os produtos de *Community Management* / Analytics e as permissões necessárias \`r_organization_admin\`, \`rw_organization_admin\` e \`r_organization_social\` (liberação pode exigir aprovação).
3. Registrar a URL de callback indicada acima.
4. Autorizar com uma conta que possua papel de administrador da Página, informar o **ID numérico** da organização e confirmar.
5. No momento, o sincronizador lê os totais orgânicos mensais de impressões, interações e cliques da Página; não inventa alcance nem exibe posts do LinkedIn sem API de conteúdo autorizada.
6. Se o token LinkedIn expirar, reconectar no painel. A renovação automática exige aprovação de acesso a tokens de refresh.

Referências:
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics
- https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access

## 4. Variáveis privadas na Vercel

Abrir **Vercel → muvens-os → Settings → Environment Variables**, escolher *Production*, e cadastrar:

| Variável | Descrição |
|---|---|
| \`SOCIAL_OAUTH_BASE_URL\` | \`https://muvens-os.vercel.app\` |
| \`SOCIAL_TOKEN_ENCRYPTION_KEY\` | 32 bytes aleatórios em Base64, guardados como segredo (gerar em ambiente seguro) |
| \`META_APP_ID\` | ID do aplicativo Meta |
| \`META_APP_SECRET\` | Segredo do aplicativo Meta |
| \`META_GRAPH_VERSION\` | \`v25.0\` (validar disponibilidade no app) |
| \`LINKEDIN_CLIENT_ID\` | ID do aplicativo LinkedIn |
| \`LINKEDIN_CLIENT_SECRET\` | Segredo do aplicativo LinkedIn |
| \`LINKEDIN_API_VERSION\` | \`202609\` (versão suportada; revisar ao longo do tempo) |
| \`SUPABASE_SERVICE_ROLE_KEY\` | Já existente no ambiente Production; deve permanecer somente no servidor |
| \`CRON_SECRET\` | Segredo aleatório para autenticar o agendador (já existente) |

Nunca usar prefixo \`NEXT_PUBLIC_\` em segredos. Após salvar, efetuar novo deploy.

**Importante:** a chave AES é a única forma de decifrar tokens existentes. Guardar o backup em um cofre. Alterá-la exige reconectar as contas; nunca compartilhá-la no chat.

## 5. Banco de dados e segurança

Migração: \`supabase/migrations/20261119000035_social_oauth_official.sql\`, **já aplicada** de forma aditiva ao banco conectado.

- \`social_connections\`: metadados das contas, RLS somente administrador.
- \`social_connection_secrets\`: tokens cifrados, sem GRANT para anon/authenticated, service role no servidor apenas.
- \`social_oauth_pending\`: credencial de curta duração, sem acesso público, expira após 15 minutos.
- \`social_period_metrics\`: agrega os indicadores realmente coletados, com \`metric_flags\` para métricas indisponíveis.
- \`social_post_metrics\`: IDs externos e resultados de posts sem duplicação ao sincronizar de novo.

## 6. Sincronização e limites

- Botão **Sincronizar** dispara a coleta manual após autorização.
- \`GET /api/social/sync\` exige \`Authorization: Bearer $CRON_SECRET\`. O job Vercel roda diariamente às 14:30 UTC (11:30 Brasília); o worker existente permanece às 14:00 UTC.
- O job não é ativado em Production até o deploy do código da branch. A Vercel aplica cron ao ambiente de produção.
- Instagram: consulta insights da conta com \`total_over_range\` para o intervalo mensal e alcance individual em posts recentes quando disponibilizado.
- Facebook: consulta interações diárias e visualizações únicas por post se disponíveis. **A Meta descontinuou métricas de alcance antigo; não converter views em reach.**
- LinkedIn: consulta estatísticas **orgânicas da organização** (impressões, cliques, likes, comentários e compartilhamentos), sem atribuir resultado pago a orgânico.
- Erros de API e ausência de métricas são sinalizados na interface. \`0\` não é equivalente a métrica indisponível.
- O ranking é montado a partir dos posts efetivamente importados; disponibilidade difere entre plataformas.

## 7. Homologação obrigatória

1. Validar compilação Next.js/TypeScript no preview; não considerar isso teste de OAuth em produção.
2. Testar que usuário não-admin não inicia OAuth nem lê metadados/tokens.
3. Confirmar que requisição anônima ao cron recebe HTTP 401 e que a chave não aparece em logs ou páginas.
4. Conectar conta Meta de teste pelo host com OAuth configurado; escolher a página correta; verificar retorno em \`/configuracoes/redes\`.
5. Sincronizar em período com publicações, conferir métricas com insights oficiais sem atribuir views a alcance.
6. Testar reconnect/token expirado e desconexão, mantendo o histórico salvo.
7. Confirmar que a tela \`/inicio\` exibe “—” quando o indicador não existe.

## Separação do projeto

- PR de integração baseada em \`feature/inicio-resumo-executivo\`; depende das PRs anteriores antes de atingir \`main\`.
- Credenciais privadas não são armazenadas no GitHub.
- Aplicativo Meta e LinkedIn devem ser criados e autorizados **pelo proprietário das contas**. Não é possível concluir a autorização por código sem essa ação.
