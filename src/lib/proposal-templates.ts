export interface ProposalContent {
  intro: string;
  sobre_cliente: string;
  expectativas: string;
  resultados: string[];
  diagnostico: string;
  objetivos: string[];
  solucao: string;
  escopo: string[];
  entregaveis: string[];
  etapas: { title: string; description: string }[];
  cronograma: string;
}

export interface TemplateItem { description: string; details?: string; billing: 'pontual' | 'mensal' }
export interface ProposalTemplate { key: string; label: string; title: string; content: ProposalContent; items: TemplateItem[]; contractMonths: number; installments: number }

const blank: ProposalContent = { intro: '', sobre_cliente: '', expectativas: '', resultados: [], diagnostico: '', objetivos: [], solucao: '', escopo: [], entregaveis: [], etapas: [], cronograma: '' };

/**
 * Modelos estruturais. NÃO contêm preços, prazos nem promessas: valores e condições são definidos por uma pessoa
 * em cada proposta (a proposta não pode ser enviada com itens sem valor).
 */
export const TEMPLATES: ProposalTemplate[] = [
  { key: 'redes_sociais', label: 'Social media (gestão de redes sociais)', title: 'Gestão de redes sociais', contractMonths: 6, installments: 1,
    content: { ...blank, solucao: 'Planejamento, produção e publicação de conteúdo para as redes sociais, com acompanhamento de desempenho.',
      objetivos: ['Fortalecer a presença digital da marca', 'Gerar relacionamento e demanda qualificada'],
      escopo: ['Planejamento editorial mensal', 'Criação de artes e roteiros', 'Agendamento e publicação', 'Relatório mensal de desempenho'],
      entregaveis: ['Calendário editorial', 'Posts e stories conforme plano contratado', 'Relatório mensal'],
      etapas: [{ title: 'Onboarding e diagnóstico', description: 'Alinhamento de marca, público e objetivos.' }, { title: 'Planejamento', description: 'Calendário e linhas editoriais.' }, { title: 'Produção e publicação', description: 'Ciclo mensal com aprovação do cliente.' }] },
    items: [{ description: 'Gestão de redes sociais (plano mensal)', billing: 'mensal' }, { description: 'Setup inicial e planejamento', billing: 'pontual' }] },
  { key: 'branding', label: 'Identidade visual (branding)', title: 'Branding e identidade visual', contractMonths: 1, installments: 2,
    content: { ...blank, solucao: 'Criação ou reposicionamento da identidade visual da marca, com manual de uso.',
      objetivos: ['Posicionar a marca de forma coerente e memorável'], escopo: ['Pesquisa e referências', 'Criação de logotipo e variações', 'Paleta, tipografia e elementos gráficos', 'Brandbook'],
      entregaveis: ['Logotipo e variações', 'Paleta e tipografia', 'Brandbook em PDF', 'Arquivos finais'],
      etapas: [{ title: 'Imersão e briefing', description: '' }, { title: 'Conceito e criação', description: '' }, { title: 'Refinamento e aprovação', description: '' }, { title: 'Entrega do brandbook', description: '' }] },
    items: [{ description: 'Projeto de identidade visual', billing: 'pontual' }] },
  { key: 'site_institucional', label: 'Site institucional', title: 'Site institucional', contractMonths: 1, installments: 2,
    content: { ...blank, solucao: 'Desenvolvimento de site institucional responsivo, alinhado à identidade da marca.',
      objetivos: ['Apresentar a empresa com credibilidade', 'Facilitar o contato de novos clientes'], escopo: ['Arquitetura de páginas', 'Design de interface', 'Desenvolvimento responsivo', 'Configuração básica de SEO e formulários'],
      entregaveis: ['Site publicado', 'Treinamento básico de uso'],
      etapas: [{ title: 'Estrutura e conteúdo', description: '' }, { title: 'Design', description: '' }, { title: 'Desenvolvimento', description: '' }, { title: 'Testes e publicação', description: '' }] },
    items: [{ description: 'Desenvolvimento de site institucional', billing: 'pontual' }] },
  { key: 'landing_page', label: 'Landing page', title: 'Landing page de conversão', contractMonths: 1, installments: 1,
    content: { ...blank, solucao: 'Página focada em conversão para uma oferta ou campanha específica.',
      objetivos: ['Converter visitantes em contatos qualificados'], escopo: ['Copy e estrutura', 'Design', 'Desenvolvimento', 'Integração com formulário/CRM'],
      entregaveis: ['Landing page publicada', 'Formulário integrado'],
      etapas: [{ title: 'Briefing e copy', description: '' }, { title: 'Design e desenvolvimento', description: '' }, { title: 'Publicação', description: '' }] },
    items: [{ description: 'Landing page', billing: 'pontual' }] },
  { key: 'trafego_pago', label: 'Tráfego pago', title: 'Gestão de tráfego pago', contractMonths: 6, installments: 1,
    content: { ...blank, solucao: 'Planejamento, criação e otimização de campanhas pagas. O investimento em mídia é pago pelo cliente diretamente às plataformas e não faz parte do valor desta proposta.',
      objetivos: ['Gerar leads/vendas com eficiência de custo'], escopo: ['Estratégia e estruturação de campanhas', 'Criativos para anúncios', 'Otimização contínua', 'Relatórios de desempenho'],
      entregaveis: ['Campanhas ativas', 'Relatório mensal'],
      etapas: [{ title: 'Diagnóstico e tracking', description: '' }, { title: 'Subida de campanhas', description: '' }, { title: 'Otimização', description: '' }] },
    items: [{ description: 'Gestão de tráfego pago (mensal)', billing: 'mensal' }] },
  { key: 'design_recorrente', label: 'Design recorrente', title: 'Design recorrente', contractMonths: 6, installments: 1,
    content: { ...blank, solucao: 'Pacote mensal de peças de design sob demanda, dentro de um volume contratado.',
      objetivos: ['Manter a comunicação visual consistente e ágil'], escopo: ['Criação de peças conforme volume contratado', 'Rodadas de revisão', 'Organização de arquivos'],
      entregaveis: ['Peças finais em formatos digitais'], etapas: [{ title: 'Solicitação via briefing', description: '' }, { title: 'Criação e revisão', description: '' }, { title: 'Entrega', description: '' }] },
    items: [{ description: 'Pacote mensal de design', billing: 'mensal' }] },
  { key: 'design_posts', label: 'Design de posts', title: 'Design de posts', contractMonths: 3, installments: 1,
    content: { ...blank, solucao: 'Criação de posts, carrosséis e stories dentro de um volume mensal contratado.',
      objetivos: ['Manter a comunicação visual consistente e profissional'], escopo: ['Criação de peças conforme volume contratado', 'Rodadas de revisão definidas na proposta', 'Entrega em formatos digitais'],
      entregaveis: ['Peças finais (posts/carrosséis/stories) conforme plano'], etapas: [{ title: 'Briefing', description: '' }, { title: 'Criação', description: '' }, { title: 'Revisão e entrega', description: '' }] },
    items: [{ description: 'Pacote mensal de design de posts', billing: 'mensal' }] },
  { key: 'consultoria', label: 'Consultoria', title: 'Consultoria', contractMonths: 1, installments: 1,
    content: { ...blank, solucao: 'Consultoria estratégica com diagnóstico, recomendações e acompanhamento.',
      objetivos: ['Definir prioridades e um plano de ação claro'], escopo: ['Diagnóstico', 'Sessões de consultoria', 'Plano de ação e recomendações'],
      entregaveis: ['Relatório/plano de ação'], etapas: [{ title: 'Diagnóstico', description: '' }, { title: 'Sessões', description: '' }, { title: 'Plano de ação', description: '' }] },
    items: [{ description: 'Consultoria', billing: 'pontual' }] },
  { key: 'rd_marketing', label: 'RD Station Marketing (automação de marketing)', title: 'Implantação e gestão do RD Station Marketing', contractMonths: 12, installments: 1,
    content: { ...blank, solucao: 'Implantação e operação do RD Station Marketing: captação de leads, nutrição por e-mail e segmentação.',
      objetivos: ['Captar e organizar leads de forma contínua', 'Nutrir contatos com fluxos automáticos'], escopo: ['Configuração da conta e integrações', 'Landing pages e formulários de captação', 'Fluxos de automação e e-mails', 'Segmentação e pontuação de leads', 'Relatórios periódicos', 'Licenças e custos de plataformas de terceiros não estão incluídos, salvo indicação na proposta'],
      entregaveis: ['Conta configurada e integrada', 'Fluxos de automação publicados', 'Relatório de resultados'], etapas: [{ title: 'Diagnóstico e planejamento', description: '' }, { title: 'Implantação', description: '' }, { title: 'Operação e otimização', description: '' }] },
    items: [{ description: 'Implantação e gestão do RD Station Marketing', billing: 'mensal' }] },
  { key: 'rd_conversas', label: 'RD Station Conversas (atendimento e WhatsApp)', title: 'Implantação do RD Station Conversas', contractMonths: 3, installments: 1,
    content: { ...blank, solucao: 'Centralização do atendimento (WhatsApp, chat do site e outros canais), com distribuição de conversas e respostas rápidas.',
      objetivos: ['Centralizar e agilizar o atendimento', 'Não perder contatos vindos dos canais digitais'], escopo: ['Configuração da plataforma e canais', 'Distribuição de conversas e respostas rápidas', 'Treinamento da equipe', 'Licenças e custos de plataformas de terceiros não estão incluídos, salvo indicação na proposta'],
      entregaveis: ['Canais conectados e configurados', 'Equipe treinada'], etapas: [{ title: 'Planejamento do atendimento', description: '' }, { title: 'Configuração', description: '' }, { title: 'Treinamento e acompanhamento', description: '' }] },
    items: [{ description: 'Implantação do RD Station Conversas', billing: 'pontual' }] },
  { key: 'automacao', label: 'Estratégia de automação', title: 'Estratégia e implantação de automações', contractMonths: 3, installments: 1,
    content: { ...blank, solucao: 'Mapeamento dos processos comerciais e de marketing e implantação de automações para ganhar tempo e organização.',
      objetivos: ['Reduzir tarefas manuais', 'Padronizar o fluxo do contato ao fechamento'], escopo: ['Mapeamento do processo atual', 'Desenho do fluxo de automação', 'Implantação e testes', 'Documentação', 'Licenças e custos de plataformas de terceiros não estão incluídos, salvo indicação na proposta'],
      entregaveis: ['Mapa do processo', 'Automações implantadas', 'Documentação'], etapas: [{ title: 'Mapeamento', description: '' }, { title: 'Desenho', description: '' }, { title: 'Implantação e testes', description: '' }] },
    items: [{ description: 'Estratégia e implantação de automações', billing: 'pontual' }] },
  { key: 'ia_aplicada', label: 'Inteligência artificial aplicada ao negócio', title: 'IA aplicada ao negócio', contractMonths: 3, installments: 1,
    content: { ...blank, solucao: 'Aplicação de inteligência artificial em processos do negócio, como atendimento, conteúdo e prospecção, com supervisão humana.',
      objetivos: ['Ganhar produtividade com apoio de IA', 'Padronizar e acelerar rotinas de atendimento e conteúdo'], escopo: ['Levantamento de oportunidades de uso', 'Configuração e testes das soluções', 'Treinamento da equipe', 'Regras de uso e supervisão humana', 'Licenças e custos de plataformas de terceiros não estão incluídos, salvo indicação na proposta'],
      entregaveis: ['Soluções configuradas', 'Guia de uso', 'Equipe treinada'], etapas: [{ title: 'Levantamento', description: '' }, { title: 'Configuração e testes', description: '' }, { title: 'Treinamento', description: '' }] },
    items: [{ description: 'IA aplicada ao negócio', billing: 'pontual' }] },
  { key: 'google_meu_negocio', label: 'Google Meu Negócio (perfil da empresa no Google)', title: 'Otimização e gestão do Google Meu Negócio', contractMonths: 6, installments: 1,
    content: { ...blank, solucao: 'Criação, verificação e otimização do perfil da empresa no Google (Maps e Pesquisa), com gestão contínua de avaliações, fotos e publicações.',
      objetivos: ['Aparecer melhor quando clientes da região procuram o seu serviço', 'Passar confiança com informações completas, fotos e avaliações', 'Facilitar o contato por ligação, rota e WhatsApp'],
      escopo: ['Auditoria do perfil atual (dados, categorias, fotos, avaliações e concorrentes locais)', 'Criação ou recuperação do perfil e apoio na verificação junto ao Google', 'Otimização: categorias, descrição, serviços/produtos, horários, atributos e links', 'Seleção e organização de fotos e vídeos', 'Estratégia para pedir e responder avaliações (sem compra de avaliações)', 'Publicações periódicas (novidades, ofertas, eventos)', 'Acompanhamento e relatório mensal de buscas, ligações, rotas e cliques', 'Acesso ao perfil concedido pelo cliente; o Google define regras e posições, sem garantia de ranking'],
      entregaveis: ['Perfil completo e otimizado', 'Plano de avaliações e modelos de resposta', 'Calendário de publicações', 'Relatório mensal'],
      etapas: [{ title: 'Auditoria e acessos', description: '' }, { title: 'Otimização do perfil', description: '' }, { title: 'Gestão e relatórios', description: '' }] },
    items: [{ description: 'Implantação e otimização do perfil no Google', billing: 'pontual' }, { description: 'Gestão mensal do perfil (publicações, avaliações e relatório)', billing: 'mensal' }] },
  { key: 'personalizado', label: 'Projeto personalizado', title: 'Proposta comercial', contractMonths: 1, installments: 1, content: blank, items: [{ description: 'Serviço', billing: 'pontual' }] },
];

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k) ?? TEMPLATES[TEMPLATES.length - 1];

export function normalizeContent(raw: unknown): ProposalContent {
  const c = (raw ?? {}) as Partial<ProposalContent>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    intro: String(c.intro ?? ''), sobre_cliente: String(c.sobre_cliente ?? ''), expectativas: String(c.expectativas ?? ''), resultados: arr(c.resultados), diagnostico: String(c.diagnostico ?? ''), solucao: String(c.solucao ?? ''), cronograma: String(c.cronograma ?? ''),
    objetivos: arr(c.objetivos), escopo: arr(c.escopo), entregaveis: arr(c.entregaveis),
    etapas: Array.isArray(c.etapas) ? c.etapas.map((e) => ({ title: String(e?.title ?? ''), description: String(e?.description ?? '') })) : [],
  };
}

export const SERVICE_LABEL: Record<string, string> = Object.fromEntries(TEMPLATES.map((t) => [t.key, t.label]));
