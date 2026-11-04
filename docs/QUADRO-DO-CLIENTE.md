# Quadro de demandas do cliente

O cliente entra por um **link de acesso gerado em Portal do Cliente > Acessos e visibilidade** (e depois em `/login`) e vê **só** os projetos liberados para ele, em **Quadro** (menu do portal).

## Colunas
Diagramação · Social Media · Em andamento · Aprovação · Solicitação de ajustes · Aprovados · Finalizados (e "Outras demandas" só se existir alguma).
Demandas que ainda não começaram ficam na coluna da sua **área**; depois seguem o fluxo: Em andamento → Aprovação (peça enviada ao cliente) → Ajustes → Aprovados → Finalizados.

## Visões
Quadro (kanban), Linha do tempo (início → entrega, com marcadores de devolução da revisão e entrega das alterações), Lista e Calendário. A equipe tem as mesmas em **Projetos** (Kanban por status, Linha do tempo, Calendário, Lista).

## O que o cliente faz
- **Nova demanda** (tipo, título, descrição, data desejada, link do conteúdo) → entra como "Solicitada" e a equipe é avisada.
- **Links**: cola o link (Drive, Dropbox, WeTransfer…) com textos/originais; ao enviar conteúdo numa demanda "Aguardando conteúdo", ela volta para a fila da equipe.
- **Mensagens** em cada demanda (a equipe só mostra ao cliente o que marcar como "Visível ao cliente").
- **Aprovar / pedir ajustes** nas peças enviadas e **pedir alteração** depois de aprovadas (vira uma nova demanda).

## Datas
- **Início** e **Entrega**: definidas pela equipe.
- **Devolução da revisão**: até quando o cliente aprova ou pede ajustes. Sugerida ao enviar para aprovação (padrão: 3 dias, em Projetos > Prazos e avisos).
- **Entrega das alterações**: até quando a equipe refaz os ajustes. Sugerida ao registrar ajustes (padrão: 2 dias).
Todas podem ser editadas na tarefa.

## Avisos de atraso por e-mail
Enviados pelo agendador diário (11h), só se ligados em **Projetos > Prazos e avisos** e com o remetente configurado em Prospecção > Configurações de envio:
- **Equipe**: resumo ao destinatário dos alertas ("a equipe está devendo" e "aguardando o cliente") e um e-mail por responsável com as tarefas dele.
- **Cliente**: lembrete aos usuários do portal sobre aprovação/conteúdo vencidos.
Cada tarefa é avisada uma vez e só repete após 3 dias ou se mudar de etapa.

## Exemplo: P&A Editora
Projetos separados por frente (ex.: "Livro — Título X", "Redes sociais — Novembro"), todos liberados no portal. O cliente abre a demanda em **Diagramação** (com o link do manuscrito) ou **Social Media** (com o link dos textos/fotos); a equipe aceita, define responsável e datas e, se faltar material, usa "Pedir conteúdo ao cliente".

## Prazos, atrasos e métricas (atualização R)
- **Relógio pausado:** enquanto a demanda está com o cliente (aguardando conteúdo ou aprovação), o prazo da equipe não corre. **Entrega prevista = entrega combinada + dias de espera do cliente.** Isso aparece nos cartões, na lista, na linha do tempo (trecho tracejado) e nos avisos: atraso do cliente não conta contra a equipe.
- **De quem é o atraso:** aprovação e conteúdo vencidos são do cliente; entrega e alterações vencidas, da equipe.
- **Projetos > Métricas** (por período e por cliente): entregas, % no prazo (com e sem o ajuste da espera do cliente), tempo médio até a entrega (equipe × cliente), rodadas de ajuste, tempo de devolução das revisões, atrasos agora (equipe × cliente) e quebra por responsável, área e cliente.
- As métricas usam o histórico de status que o sistema já grava; tarefas antigas entram com as datas reais de cada mudança de etapa.

## Ver como o cliente + painel estilo Trello (atualização T)
**Portal do Cliente > Ver como o cliente** (ou o botão em Projetos): escolha o cliente e veja o quadro **exatamente como ele vê** (só projetos liberados e tarefas não internas). Ali você também:
- cria cartões em **Diagramação**, **Social Media** e **Em andamento** ("+ Adicionar cartão");
- **arrasta** cartões entre as colunas; o sistema percorre as etapas intermediárias do fluxo (ex.: levar para "Aprovados" registra produzido → enviado → aprovado);
- abre qualquer cartão para editar a tarefa completa (responsáveis, datas, links).
Se o cliente tem projetos ainda não liberados, aparece um aviso com o link para liberar. Para ver as demais telas (Aprovações, Documentos…) como o cliente, entre com um usuário de teste do tipo cliente.

## Pessoas envolvidas
No campo **Responsáveis** da tarefa você marca **todas as pessoas envolvidas** e indica o **principal** (o que conta nas métricas e nos avisos de atraso). Os nomes aparecem nos cartões, na linha do tempo, no calendário, na lista e na página da tarefa (que também mostra as pessoas do cliente que comentaram). Quem é incluído recebe um aviso.

## Entrada do cliente
O cliente entra em `/login` e **cai direto no Quadro** (`/cliente/quadro`). O menu continua com Início, Serviços, Projetos, Aprovações etc.

## Serviços (atualização U)
Em **Clientes > cliente > Serviços** a equipe (administrador/financeiro) cadastra os serviços do cliente (ex.: "Diagramação de livros", "Criativos para redes sociais"), com descrição e visibilidade no portal. O cliente vê **Meus serviços** (nome, tipo de contrato, período, descrição e o andamento das demandas — **nunca valores**) e pode filtrar o quadro por serviço. Cada tarefa pode ser ligada a um serviço (campo "Serviço do cliente"). Serviços cadastrados à mão com valor maior que zero entram na receita recorrente do sistema; use 0 para só exibir no portal.

## Contatos do cliente nas tarefas (atualização V)
Os contatos cadastrados em **Clientes > cliente > Contatos** (ex.: Diego Vogt, CEO) podem ser marcados em cada tarefa, em **Contatos do cliente nesta tarefa**. Eles aparecem em **Pessoas envolvidas**, nos cartões ("Cliente: Diego") e no portal (só nome e cargo). A tarefa também mostra e-mail e WhatsApp deles com atalho para abrir.
**Nome em branco:** quem não tem nome no perfil passa a aparecer pelo e-mail (ex.: "Dani Designer"). Para ajustar, abra **Configurações** e preencha o campo Nome do usuário.

## Gerar o link de acesso do cliente
**Portal do Cliente > Acessos e visibilidade > Gerar link de acesso** (somente administrador): escolha a empresa, informe nome e e-mail da pessoa e clique em gerar. O sistema cria o login, vincula à empresa e mostra um **link de uso único** (com botões Copiar link, Copiar mensagem pronta e Abrir no WhatsApp).
- O cliente abre o link, clica em **Entrar** e **cria a própria senha**; depois entra em `/login` com e-mail e senha e cai direto no Quadro.
- O link **não fica salvo**: aparece uma vez na tela. Se expirar ou já tiver sido usado, use **Gerar novo link** na lista de usuários (o novo invalida o anterior). O prazo de validade é do Supabase (Authentication > Providers > Email > Email OTP Expiration).
- O botão "Entrar" na página do link evita que prévias de WhatsApp/e-mail gastem o link sem querer.
- Segurança: nunca transforma um usuário da equipe em cliente e não move um cliente de uma empresa para outra (ajuste em Configurações). Exige `SUPABASE_SERVICE_ROLE_KEY` na Vercel (a mesma do agendador).

## Vários usuários, login e senha
Cada pessoa da empresa do cliente tem o **próprio login**. Em **Portal do Cliente > Acessos e visibilidade**, repita o formulário para cada usuário e escolha como entregar:
- **Link de acesso** (recomendado): a pessoa abre o link e cria a senha.
- **Login e senha**: o sistema cria o usuário com uma **senha forte gerada na hora**, mostrada **uma única vez**, com botões para copiar e uma mensagem pronta (endereço, login e senha) para WhatsApp. Para quem já tem acesso, "Nova senha" substitui a senha atual.
Na lista de usuários há **Novo link** e **Nova senha** em cada pessoa. O cliente troca a própria senha em **Alterar senha** (cabeçalho do portal). O endereço de login do portal (`/login`) aparece no topo do formulário para copiar.
