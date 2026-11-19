# Diagnósticos consultivos MUVENS OS

Branch: \`feature/diagnosticos-consultivos\`.

## Objetivo

Menu **Comercial → Diagnósticos**: produzir e enviar relatórios consultivos por demanda. Este fluxo é separado do diagnóstico automático da prospecção fria. Nenhum cliente é contatado automaticamente.

## Abrangência

Seleção independente de 1 a 7 áreas: Site institucional, Landing Page, Identidade visual, Feed do Instagram, LinkedIn, Tráfego pago e Perfil da Empresa no Google.

## Jornada

1. Em \`/diagnosticos\`, cadastrar empresa, contato, áreas, URLs e contexto.
2. Na tela do diagnóstico, adicionar prints PNG/JPG/WebP (até 5 MB por arquivo), vinculados às áreas.
3. Acionar **Gerar análise com IA**. A ferramenta lê HTML público de site/landing page com proteção contra SSRF; examina as capturas informadas para as demais áreas.
4. Revisar os pontos fortes, achados, evidências, impactos, prioridades e recomendações. Salvar alterações.
5. Publicar. O sistema emite endereço \`/relatorio-digital/<token>\` e mensagem de contato com link, ambos copiáveis. Pode despublicar.

O relatório público não expõe prints nem notas internas do usuário. O link público usa token de 256 bits e consulta apenas relatórios publicados, no servidor. Não existem métricas inventadas nem integrações com contas privadas de Ads, Instagram ou LinkedIn.

## Ativação e validação

- **Não aplicar diretamente ao banco de produção sem revisão e backup.** Executar \`supabase/atualizacoes/K_diagnosticos_consultivos.sql\` em homologação e validar policies/RLS e uploads.
- Configurar \`ANTHROPIC_API_KEY\` e \`ANTHROPIC_MODEL\` somente no servidor, com um modelo capaz de processar imagens e usar ferramentas. Definir \`NEXT_PUBLIC_APP_URL\`.
- Testar o fluxo completo com um usuário admin e outro comercial, e verificar que um usuário cliente/sem acesso não lê dados.
- Testar link de relatório publicado, revogação, token inválido e tentativa de ver prints pelo navegador anônimo.
- Garantir que a análise seja usada somente com materiais que se tem autorização para tratar e publicar. As capturas são armazenadas em bucket privado.
- Limitação: o analisador automático observa até 8 prints no momento. Para redes sociais, sem evidências adequadas, a resposta deve declarar que não foi possível validar determinada dimensão.
- Revisar plano e limites/custos da API de IA antes do uso recorrente.

## Menu renovado

\`Sidebar.tsx\` foi redesenhado em estrutura dark, com cabeçalho de workspace, busca global Ctrl+K, acesso rápido com base na permissão, grupos operacionais, item ativo destacado, recolhimento no desktop, drawer no celular e bloco de usuário com sair.

O tema da página continua respeitando light/dark do usuário: a barra lateral permanece preta por identidade visual, sem alterar a responsividade dos demais módulos.
