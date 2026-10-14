import { SERVICE_LABEL } from '@/lib/proposal-templates';
import type { Scored } from './analysis';

export interface Sender { name: string; companyLegalName: string; companyDocument?: string | null; companyAddress: string }
export interface ProspectForMessage { name: string; category?: string | null; city?: string | null }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SERVICE_PITCH: Record<string, string> = {
  site_institucional: 'um site institucional claro e adaptado para celular', landing_page: 'uma página de conversão focada em gerar contatos',
  redes_sociais: 'a gestão e a criação de conteúdo para as redes sociais', trafego_pago: 'campanhas de anúncios com medição de resultado',
  branding: 'a organização da identidade visual da marca', design_posts: 'peças de design para as redes sociais', consultoria: 'uma consultoria de presença digital', google_meu_negocio: 'a otimização do perfil da empresa no Google (Google Meu Negócio), para aparecer melhor nas buscas e no Maps', rd_marketing: 'a automação de marketing para captar e nutrir contatos', rd_conversas: 'o atendimento centralizado dos contatos por WhatsApp e chat', automacao: 'a automação de processos comerciais e de marketing', ia_aplicada: 'o uso de inteligência artificial nas rotinas do negócio',
};

/**
 * Rascunho do e-mail de 1º contato. Texto determinístico: só cita observações da análise ("não encontramos…"),
 * sem preço, prazo, resultado garantido ou elogio falso. Uma pessoa pode editar/aprovar antes do envio.
 */
export function draftFirstEmail(p: ProspectForMessage, scored: Scored, s: Sender) {
  const obs = scored.observations.slice(0, 3);
  const where = [p.category, p.city].filter(Boolean).join(' em ');
  const lines = [
    'Olá, tudo bem?', '',
    `Meu nome é ${s.name}, da Muvens Agência (design, marketing digital e IA aplicada a negócios). Encontrei a ${p.name}${where ? ` ao pesquisar ${where}` : ''} e fiz uma análise rápida da presença online de vocês, usando apenas informações públicas.`,
    ...(obs.length ? ['', 'O que observamos:', ...obs.map((o) => `• ${o}`)] : []),
    '', `Se fizer sentido, posso ajudar com ${SERVICE_PITCH[scored.service] ?? SERVICE_LABEL[scored.service] ?? 'o que for mais prioritário'} e enviar um diagnóstico mais completo, sem compromisso. Basta responder este e-mail.`,
    '', 'Obrigado pela atenção!', s.name,
  ];
  const first = obs[0]?.replace(/^Não encontramos /, '').replace(/^O /, '');
  const subject = first ? `${p.name}: uma observação sobre a presença digital` : `${p.name}: uma ideia rápida para a presença digital`;
  return { subject, body: lines.join('\n') };
}

export function draftFollowup(p: ProspectForMessage, s: Sender) {
  return {
    subject: `Re: ${p.name} — presença digital`,
    body: ['Olá, tudo bem?', '', `Volto a falar rapidamente sobre a análise da presença online da ${p.name} que enviei há alguns dias. Se tiver interesse, posso mandar o diagnóstico completo, sem compromisso. Se não for o momento, sem problema — é só me avisar.`, '', 'Abraço,', s.name].join('\n'),
  };
}

/** Rodapé obrigatório: identificação do remetente, motivo do contato e descadastro. */
export function emailFooter(s: Sender, unsubUrl: string) {
  const id = [s.companyLegalName, s.companyDocument && `CNPJ ${s.companyDocument}`, s.companyAddress].filter(Boolean).join(' — ');
  const reason = 'Você recebeu esta mensagem porque sua empresa tem informações de contato publicadas e atua em um segmento em que oferecemos serviços (legítimo interesse, LGPD, art. 7º, IX).';
  return {
    text: `\n\n--\n${id}\n${reason}\nPara não receber mais mensagens nossas: ${unsubUrl}`,
    html: `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0"><p style="font-size:12px;color:#666;line-height:1.5">${esc(id)}<br>${esc(reason)}<br><a href="${esc(unsubUrl)}">Não quero mais receber mensagens</a></p>`,
  };
}

export function bodyToHtml(body: string) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${esc(body).replace(/\n/g, '<br>')}</div>`;
}

/** Link "click-to-chat" do WhatsApp: abre a conversa com o texto preenchido; uma PESSOA decide enviar. */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export const WHATSAPP_INTRO = (name: string, sender: string) => `Olá! Aqui é ${sender}, da Muvens Agência. Vi a ${name} e analisei a presença online de vocês. Posso enviar uma análise rápida e gratuita? Se não quiser receber contato, é só avisar.`;

/** Rascunho para LEAD DE ANÚNCIO (relacionamento, não é abordagem fria): agradece, apresenta e convida a responder perguntas rápidas. */
export function draftInboundEmail(p: { name: string; company?: string | null }, s: Sender, qualifyUrl: string) {
  const first = p.name.trim().split(/\s+/)[0];
  return {
    subject: `${first}, obrigado pelo interesse — algumas perguntas rápidas`,
    body: [
      `Olá, ${first}! Tudo bem?`, '',
      `Aqui é ${s.name}, da Muvens Agência (design, marketing digital e IA aplicada a negócios). Recebemos o seu interesse${p.company ? ` pela ${p.company}` : ''} e queremos entender o seu momento antes de sugerir qualquer coisa.`, '',
      'Para isso, preparamos algumas perguntas rápidas (leva cerca de 2 minutos): quais são as suas maiores dificuldades hoje e o que você mais precisa resolver. Com as respostas, indicamos o melhor caminho e, se fizer sentido, enviamos uma proposta sob medida.', '',
      `Responder agora: ${qualifyUrl}`, '',
      'Se preferir, é só responder este e-mail contando o que está precisando.', '',
      'Um abraço,', s.name,
    ].join('\n'),
  };
}
export const WHATSAPP_INBOUND = (name: string, sender: string, qualifyUrl: string) => `Olá, ${name.trim().split(/\s+/)[0]}! Aqui é ${sender}, da Muvens Agência. Vi que você demonstrou interesse nos nossos serviços. Para entender como podemos ajudar, pode responder algumas perguntas rápidas? ${qualifyUrl}`;

// ---------- Nutrição de leads frios (rascunhos espaçados; nada sai sem aprovação) ----------
const TIPS: Record<string, { title: string; tips: string[] }> = {
  site_institucional: { title: 'o site da sua empresa', tips: ['Deixe claro, na primeira tela, o que você faz e para quem.', 'Coloque o WhatsApp e um botão de contato visíveis em todas as páginas.', 'Confira se o site abre rápido e bem no celular: a maioria dos acessos vem de lá.'] },
  landing_page: { title: 'uma página de captação', tips: ['Uma página, uma oferta e um único botão de ação.', 'Peça poucos dados no formulário: cada campo extra reduz os contatos.', 'Responda quem preencheu no mesmo dia: a demora esfria o interesse.'] },
  redes_sociais: { title: 'as redes sociais', tips: ['Poucas publicações com padrão visual valem mais que muitas sem identidade.', 'Mostre o dia a dia e os resultados para os clientes, não só promoções.', 'Fixe no topo do perfil o que você vende e como falar com você.'] },
  design_posts: { title: 'o design dos posts', tips: ['Use sempre as mesmas cores, fontes e estilo de imagem.', 'Uma ideia por post, com texto curto e legível no celular.', 'Reaproveite modelos para manter a frequência sem perder a qualidade.'] },
  branding: { title: 'a identidade visual', tips: ['Defina cores, tipografia e estilo e aplique em tudo, do perfil ao orçamento.', 'Garanta uma versão do logo que funcione em fundo claro e escuro.', 'Consistência faz a marca ser reconhecida antes mesmo de ser lida.'] },
  trafego_pago: { title: 'anúncios', tips: ['Antes de investir, instale o pixel e saiba medir o que é um contato.', 'Comece com uma oferta clara e um público bem definido.', 'Acompanhe o custo por contato, não só cliques e curtidas.'] },
  rd_marketing: { title: 'automação de marketing', tips: ['Organize onde chegam os contatos e quem responde cada um.', 'Crie uma sequência simples de e-mails para quem ainda não está pronto para comprar.', 'Meça quantos contatos viram conversa, e quantas conversas viram venda.'] },
  ia_aplicada: { title: 'inteligência artificial no negócio', tips: ['Comece por uma tarefa repetitiva, como respostas frequentes ou rascunhos de conteúdo.', 'Mantenha uma pessoa revisando o que a IA produz.', 'Documente o que funcionou para repetir em outras áreas.'] },
  consultoria: { title: 'o seu plano de crescimento', tips: ['Liste as 3 maiores dificuldades e escolha uma para resolver primeiro.', 'Defina uma meta simples e um prazo para medir o resultado.', 'Revise o plano todo mês: o que funcionou, o que ajustar.'] },
};
const FALLBACK_TIPS = TIPS.consultoria;

export function draftNurture(step: 2 | 3 | 4, p: { name: string; services?: string[] }, s: Sender, links: { qualify: string }) {
  const first = p.name.trim().split(/\s+/)[0]; const area = TIPS[p.services?.[0] ?? ''] ?? FALLBACK_TIPS;
  if (step === 2) return { subject: `${first}, 3 dicas rápidas sobre ${area.title}`, body: [`Olá, ${first}! Tudo bem?`, '', `Quando conversamos, você comentou que ainda estava avaliando como melhorar a presença digital. Separei 3 dicas simples sobre ${area.title} que você pode aplicar sem custo:`, '', ...area.tips.map((t) => `• ${t}`), '', 'Se quiser trocar uma ideia sobre o seu caso, é só responder este e-mail.', '', 'Um abraço,', s.name].join('\n') };
  if (step === 3) return { subject: `${first}, como está o seu momento?`, body: [`Olá, ${first}! Tudo bem?`, '', 'Já faz algumas semanas desde o nosso último contato. Queria saber se o cenário mudou e se faz sentido retomar a conversa sobre a presença digital da sua empresa.', '', `Se preferir, atualize as suas respostas em 2 minutos: ${links.qualify}`, '', 'Se não for o momento, sem problema: é só me avisar.', '', 'Um abraço,', s.name].join('\n') };
  return { subject: `${first}, encerrando por aqui (a porta continua aberta)`, body: [`Olá, ${first}!`, '', 'Não quero ser inconveniente, então vou encerrar os nossos contatos por aqui. Se no futuro quiser retomar a conversa sobre site, redes sociais, anúncios ou automação, é só responder este e-mail.', '', 'Desejo muito sucesso à sua empresa!', s.name].join('\n') };
}
export const NURTURE_AFTER_DAYS: Record<2 | 3 | 4, number> = { 2: 15, 3: 45, 4: 90 };
