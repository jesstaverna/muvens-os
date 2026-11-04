# Quadro de demandas do cliente

O cliente entra em `/login` (convite criado em **Portal do Cliente**) e vê **só** os projetos liberados para ele, em **Quadro** (menu do portal).

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
Cada tarefa tem um **responsável principal** e **outros responsáveis**. Os nomes aparecem nos cartões, na linha do tempo, no calendário, na lista e na página da tarefa (que também mostra as pessoas do cliente que comentaram). Quem é incluído recebe um aviso.
