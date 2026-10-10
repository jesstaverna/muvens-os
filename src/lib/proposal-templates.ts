export interface ProposalContent {
  intro: string;
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

const blank: ProposalContent = { intro: '', diagnostico: '', objetivos: [], solucao: '', escopo: [], entregaveis: [], etapas: [], cronograma: '' };

/**
 * Modelos estruturais. NÃO contêm preços, prazos nem promessas: valores e condições são definidos por uma pessoa
 * em cada proposta (a proposta não pode ser enviada com itens sem valor).
 */
export const TEMPLATES: ProposalTemplate[] = [
  { key: 'redes_sociais', label: 'Gestão de redes sociais', title: 'Gestão de redes sociais', contractMonths: 6, installments: 1,
    content: { ...blank, solucao: 'Planejamento, produção e publicação de conteúdo para as redes sociais, com acompanhamento de desempenho.',
      objetivos: ['Fortalecer a presença digital da marca', 'Gerar relacionamento e demanda qualificada'],
      escopo: ['Planejamento editorial mensal', 'Criação de artes e roteiros', 'Agendamento e publicação', 'Relatório mensal de desempenho'],
      entregaveis: ['Calendário editorial', 'Posts e stories conforme plano contratado', 'Relatório mensal'],
      etapas: [{ title: 'Onboarding e diagnóstico', description: 'Alinhamento de marca, público e objetivos.' }, { title: 'Planejamento', description: 'Calendário e linhas editoriais.' }, { title: 'Produção e publicação', description: 'Ciclo mensal com aprovação do cliente.' }] },
    items: [{ description: 'Gestão de redes sociais (plano mensal)', billing: 'mensal' }, { description: 'Setup inicial e planejamento', billing: 'pontual' }] },
  { key: 'branding', label: 'Branding e identidade visual', title: 'Branding e identidade visual', contractMonths: 1, installments: 2,
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
  { key: 'personalizado', label: 'Projeto personalizado', title: 'Proposta comercial', contractMonths: 1, installments: 1, content: blank, items: [{ description: 'Serviço', billing: 'pontual' }] },
];

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k) ?? TEMPLATES[TEMPLATES.length - 1];

export function normalizeContent(raw: unknown): ProposalContent {
  const c = (raw ?? {}) as Partial<ProposalContent>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    intro: String(c.intro ?? ''), diagnostico: String(c.diagnostico ?? ''), solucao: String(c.solucao ?? ''), cronograma: String(c.cronograma ?? ''),
    objetivos: arr(c.objetivos), escopo: arr(c.escopo), entregaveis: arr(c.entregaveis),
    etapas: Array.isArray(c.etapas) ? c.etapas.map((e) => ({ title: String(e?.title ?? ''), description: String(e?.description ?? '') })) : [],
  };
}
