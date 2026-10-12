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
const RANK = { ausente: 0, atencao: 1, desconhecido: 2, ok: 3 } as const;

export function buildProposal(r: Report): Step[] {
  const steps = r.pillars.filter((p) => p.status === 'ausente' || p.status === 'atencao').sort((a, b) => RANK[a.status] - RANK[b.status]).map((p) => ({ p, plan: PLAN[p.key] })).filter((x) => x.plan);
  const out: Step[] = steps.map(({ p, plan }, i) => ({ phase: i < 2 ? 1 : i < 4 ? 2 : 3, title: plan.title, why: p.summary, deliverables: plan.deliverables, service: plan.service }));
  if (r.service && !out.some((s) => s.service === r.service) && out.length < 3 && PLAN[Object.keys(PLAN).find((k) => PLAN[k].service === r.service) ?? '']) {
    const k = Object.keys(PLAN).find((x) => PLAN[x].service === r.service)!; out.unshift({ phase: 1, title: PLAN[k].title, why: 'Serviço com maior potencial segundo a análise', deliverables: PLAN[k].deliverables, service: r.service });
  }
  if (!out.length) out.push({ phase: 1, title: 'Consultoria de presença digital', why: 'Base digital em boa forma: foco em evoluir e medir', deliverables: ['Revisão de oportunidades de crescimento', 'Plano de conteúdo e mídia com metas'], service: 'consultoria' });
  return out;
}
