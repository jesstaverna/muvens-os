# Central de Solicitações + Quadro de Produção ampliado

## O que mudou

### Portal do cliente
- Página exclusiva: \`/cliente/solicitar\` para clientes autenticados e ativos.
- Atalho compartilhável: \`/solicitar\`. Usuários sem sessão seguem a \`/login?next=%2Fcliente%2Fsolicitar\`; depois do login, entram no formulário da própria empresa.
- O formulário seleciona **um projeto previamente liberado**, a área, título, descrição, objetivo, formato/quantidade, prazo desejado e link de referências.
- A criação reaproveita \`public.portal_create_task\`, que valida em Supabase o vínculo de cliente e visibilidade do projeto. O pedido nasce com \`status='solicitada'\` e \`origin='cliente'\`. Não é necessário criar tabela paralela.
- O cliente é enviado ao detalhe da solicitação criada, com acesso permitido somente aos cartões de projetos da própria empresa.
- Em Portal do Cliente → Acessos e visibilidade, a equipe encontra o link para copiar.
- A tela principal do portal e a navegação também incluem **Solicitar demanda**.
- Links antigos de \`/cliente/quadro/nova\` redirecionam para a página nova.

### Coluna de entrada do board
- A primeira coluna do Kanban da agência exibe \`Solicitação de cliente\`, separada de \`A fazer\`.
- O quadro do portal e a visualização interna espelhada usam a mesma regra: tarefas \`solicitada\` aparecem nessa primeira coluna, independentemente de serem Diagramação, Social Media ou Outra.
- Depois da triagem, ao avançar para \`a_fazer\`, os cartões passam para a coluna relativa à área do serviço (quando o quadro usa agrupamento por área), enquanto o Kanban interno mostra \`A fazer\`.
- O workflow, a atribuição de responsáveis, aprovações e a visibilidade de arquivos continuam os existentes.

### Layout — Projetos e Tarefas
- A área do módulo \`/projetos\` usa a largura disponível, sem o limite global de 1400px. As demais áreas continuam com a largura anterior.
- Kanban com colunas amplas, cartões estilo Trello e cabeçalhos operacionais inspirados em Runrun.it.
- Cards mostram empresa, projeto, prazo, criticidade, pessoas envolvidas, origem e alerta de escopo.
- Busca em cliente/projeto/título/responsáveis, filtros por pessoa e prioridade, opção somente atrasadas, modo etapas principais, contadores e botões para navegar horizontalmente.
- Os filtros gerais de cliente/projeto/mim continuam na rota; os filtros de cartão funcionam localmente com os dados trazidos pela consulta corrente.
- Movimentos passam pelo \`statusPath\`, seguindo as transições previstas e respeitando permissões. As mudanças são persistidas em \`tasks\`; registros não são duplicados.
- A versão do portal não expõe tarefas internas nem dados de outras empresas.

## Validação necessária
1. Conferir a rota \`/solicitar\` sem login e a volta ao formulário após autenticação.
2. Usar dois usuários de empresas diferentes para verificar o isolamento de dados, de tarefas e de projetos.
3. Criar solicitação de cada área e confirmar no board interno na coluna **Solicitação de cliente**.
4. Aprovar a triagem, atribuir membros, ajustar prazos e seguir o fluxo.
5. Testar drag-and-drop, seletor de status, filtro por pessoa, busca, modo somente atrasadas e exibição mobile.
6. Testar um usuário com perfil financeiro para garantir que ele não consegue mudar tarefas.
7. Conferir Vercel build e testes em ambiente de homologação antes de mesclar na branch principal.

**Observação:** A solução aproveita funções existentes do Supabase, sem novas migrações ou acesso anônimo às tarefas. Não depende da funcionalidade de diagnóstico, embora a branch de desenvolvimento tenha sido baseada na branch que também contém o novo módulo de Diagnósticos.
