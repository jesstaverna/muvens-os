import type { Report } from './report';

// Proposta de melhorias derivada do diagnóstico: o que fazer em cada área com problema. Sem preços, prazos ou promessa de resultado.
export interface Step { phase: number; title: string; why: string; deliverables: string[]; service: string }
const PLAN: Record<string, { title: string; service: string; deliverables: string[] }> = {
  site: { title: 'Site que passa confiança', service: 'site_institucional', deliverables: ['Site adaptado para celular, com HTTPS e boa velocidade', 'Textos e descrição para o Google (SEO básico)', 'Páginas de serviços e contato'] },
  conversao: { title: 'Mais contatos vindos do site', service: 'landing_page', deliverables: ['Botão de WhatsApp e formulário de contato', 'Página de conversão focada em uma oferta', 'Mensagens prontas de atendimento'] },
  redes: { title: 'Redes sociais com constância', service: 'redes_sociais', deliverables: ['Perfis organizados e ligados ao site', 'Calendário de conteúdo', 'Peças de design com padrão visual'] },
  marca: { title: 'Marca mais profissional e reconhecível', service: 'branding', deliverables: ['Revisão da identidade visual (logo, cores, tipografia)', 'Ícone e imagem de compartilhamento do site', 'Estratégia para ganhar avaliações no Google'] },
  anuncios: { title: 'Anúncios com resultado medido', service: 'trafego_pago', deliverables: ['Instalação de pixel e Tag Manager', 'Campanhas iniciais segmentadas', 'Relatório de resultados'] },
};
const EXTRAS: Record<string, { title: string; service: string; deliverables: string[] }> = {
  rd_conversas: { title: 'Atendimento centralizado (RD Station Conversas)', service: 'rd_conversas', deliverables: ['WhatsApp, chat do site e outros canais em um só lugar', 'Distribuição de conversas e respostas rápidas', 'Treinamento da equipe'] },
  rd_marketing: { title: 'Captação e nutrição de leads (RD Station Marketing)', service: 'rd_marketing', deliverables: ['Formulários e páginas de captação integrados', 'Fluxos automáticos de e-mail', 'Relatório de leads e resultados'] },
};
const B2B_STEPS: { title: string; why: string; service: string; deliverables: string[] }[] = [
  { service: 'rd_marketing', title: 'Geração e nutrição de leads (RD Station Marketing)', why: 'Em vendas B2B o ciclo é longo: nutrir contatos aumenta a chance de falar na hora certa', deliverables: ['Captação de leads com formulários e páginas integradas', 'Fluxos de nutrição por e-mail e pontuação de leads', 'Relatórios de funil para o time comercial'] },
  { service: 'automacao', title: 'Estratégia de automação do funil comercial', why: 'Padronizar o caminho do primeiro contato até o fechamento reduz tarefas manuais e perdas', deliverables: ['Mapa do processo comercial atual', 'Automações de follow-up e distribuição de leads', 'Documentação e treinamento do time'] },
  { service: 'ia_aplicada', title: 'IA aplicada ao atendimento e à prospecção', why: 'IA com supervisão humana acelera respostas, qualificação e produção de conteúdo técnico', deliverables: ['Levantamento de rotinas que ganham com IA', 'Soluções configuradas e testadas', 'Regras de uso e treinamento'] },
];
const RANK = { ausente: 0, atencao: 1, desconhecido: 2, ok: 3 } as const;

export function buildProposal(r: Report): Step[] {
  const steps = r.pillars.filter((p) => p.status === 'ausente' || p.status === 'atencao').sort((a, b) => RANK[a.status] - RANK[b.status]).map((p) => ({ p, plan: PLAN[p.key] })).filter((x) => x.plan);
  const out: Step[] = steps.map(({ p, plan }, i) => ({ phase: i < 2 ? 1 : i < 4 ? 2 : 3, title: plan.title, why: p.summary, deliverables: plan.deliverables, service: plan.service }));
  if (r.service && !out.some((s) => s.service === r.service) && out.length < 3 && PLAN[Object.keys(PLAN).find((k) => PLAN[k].service === r.service) ?? '']) {
    const k = Object.keys(PLAN).find((x) => PLAN[x].service === r.service)!; out.unshift({ phase: 1, title: PLAN[k].title, why: 'Serviço com maior potencial segundo a análise', deliverables: PLAN[k].deliverables, service: r.service });
  }
  const conv = r.pillars.find((p) => p.key === 'conversao');
  if (conv && (conv.status === 'ausente' || conv.status === 'atencao') && out.length < 5) for (const k of ['rd_conversas', 'rd_marketing']) out.push({ phase: 3, why: 'Organizar e automatizar os contatos que chegam', ...EXTRAS[k] });
  if (r.b2bStructured) { for (const b of B2B_STEPS) if (!out.some((x) => x.service === b.service)) out.push({ phase: 2, ...b }); }
  if (!out.length) out.push({ phase: 1, title: 'Consultoria de presença digital', why: 'Base digital em boa forma: foco em evoluir e medir', deliverables: ['Revisão de oportunidades de crescimento', 'Plano de conteúdo e mídia com metas'], service: 'consultoria' });
  return out;
}

/** Descrição curta de cada serviço para a seção de valores da landing. */
export const SERVICE_BLURB: Record<string, string> = {
  redes_sociais: 'Planejamento, criação e gestão de conteúdo para as redes sociais.',
  branding: 'Identidade visual completa: logo, cores, tipografia e aplicações.',
  site_institucional: 'Site profissional, rápido, adaptado para celular e otimizado para o Google.',
  landing_page: 'Página focada em uma oferta, pensada para gerar contatos.',
  trafego_pago: 'Campanhas de anúncios com medição de resultado e otimização.',
  design_recorrente: 'Peças de design todo mês, com padrão visual da marca.',
  design_posts: 'Artes para posts e stories, no padrão visual da empresa.',
  consultoria: 'Diagnóstico e plano de ação para a presença digital.',
  rd_marketing: 'Automação de marketing: captação, nutrição e acompanhamento de leads no RD Station.',
  rd_conversas: 'Atendimento centralizado (WhatsApp e chat) com distribuição de conversas e respostas rápidas.',
  automacao: 'Mapeamento e automação dos processos comerciais e de marketing.',
  ia_aplicada: 'Inteligência artificial aplicada a atendimento, conteúdo e prospecção, com supervisão humana.',
  personalizado: 'Projeto sob medida para uma necessidade específica.',
};
