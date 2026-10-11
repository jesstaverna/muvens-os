import { SERVICE_LABEL } from '@/lib/proposal-templates';
import type { Scored } from './analysis';

export interface Sender { name: string; companyLegalName: string; companyDocument?: string | null; companyAddress: string }
export interface ProspectForMessage { name: string; category?: string | null; city?: string | null }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SERVICE_PITCH: Record<string, string> = {
  site_institucional: 'um site institucional claro e adaptado para celular', landing_page: 'uma página de conversão focada em gerar contatos',
  redes_sociais: 'a gestão e a criação de conteúdo para as redes sociais', trafego_pago: 'campanhas de anúncios com medição de resultado',
  branding: 'a organização da identidade visual da marca', design_posts: 'peças de design para as redes sociais', consultoria: 'uma consultoria de presença digital',
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
