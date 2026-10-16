import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailProvider } from '@/integrations/email';
import { bodyToHtml, whatsappLink } from '@/lib/prospecting/message';
import { AREAS, CONTATO, DECISOR, INVEST, PRAZO, type Answers } from './qualify';

const lab = (list: readonly { v: string; l: string }[], v: string) => list.find((x) => x.v === v)?.l ?? '—';

/** Alerta por e-mail para a equipe quando um lead QUENTE responde à qualificação (ligado em Configurações de envio). Inclui link para abrir o WhatsApp do lead. */
export async function sendHotLeadAlert(db: SupabaseClient, provider: EmailProvider | null, appUrl: string, leadId: string, a: Answers, score: number) {
  if (!provider) return { sent: false, skipped: 'provedor de e-mail não configurado' };
  const { data: s } = await db.from('outreach_settings').select('alert_hot_enabled, alert_to, weekly_digest_to, sender_name, sender_email').eq('id', 1).single();
  const to = s?.alert_to || s?.weekly_digest_to;
  if (!s?.alert_hot_enabled) return { sent: false, skipped: 'alerta desligado' };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !s.sender_email || !s.sender_name) return { sent: false, skipped: 'destinatário ou remetente não configurado' };
  const { data: lead } = await db.from('leads').select('name, company, email, phone, whatsapp').eq('id', leadId).maybeSingle();
  if (!lead) return { sent: false, skipped: 'lead não encontrado' };
  const first = lead.name.trim().split(/\s+/)[0]; const base = appUrl.replace(/\/$/, '');
  const wa = whatsappLink(lead.whatsapp ?? lead.phone, `Olá, ${first}! Aqui é da Muvens Agência. Vi as suas respostas e quero ajudar com o que você precisa. Posso te ligar ou prefere conversar por aqui?`);
  const body = [
    `Lead QUENTE respondeu à qualificação (${score}/100)`, '',
    `${lead.name}${lead.company ? ` — ${lead.company}` : ''}`, `E-mail: ${lead.email ?? '—'}  ·  Telefone: ${lead.whatsapp ?? lead.phone ?? '—'}`, '',
    `Maior dificuldade: ${a.dificuldade}`, `Precisa resolver: ${a.precisa}`,
    `Áreas: ${a.areas.map((k) => AREAS.find((x) => x.key === k)?.label ?? k).join(', ') || '—'}`,
    `Investe hoje: ${lab(INVEST, a.invest)}  ·  Prazo: ${lab(PRAZO, a.prazo)}  ·  Decide: ${lab(DECISOR, a.decisor)}  ·  Prefere: ${a.contato ? lab(CONTATO, a.contato) : '—'}`, '',
    ...(wa ? [`Falar agora pelo WhatsApp: ${wa}`] : []),
    `Abrir o lead no CRM (e criar a proposta): ${base}/crm/${leadId}`,
  ].join('\n');
  await provider.send({ from: `"Muvens OS" <${s.sender_email}>`, to, subject: `Lead quente: ${lead.name} (${score}/100)`, text: body, html: bodyToHtml(body), unsubscribeUrl: `${base}/prospeccao?tab=config` });
  return { sent: true };
}

/** Alerta por e-mail para a equipe a cada pedido de diagnóstico gratuito feito na página do site (usa a mesma configuração do alerta de lead quente). */
export async function sendDiagnosisRequestAlert(db: SupabaseClient, provider: EmailProvider | null, appUrl: string, leadId: string, ctx: { site?: string | null; instagram?: string | null; source: string; campaign?: string | null; ad?: string | null; qual?: { a: Answers; score: number; fit: string } }) {
  if (!provider) return { sent: false, skipped: 'provedor de e-mail não configurado' };
  const { data: s } = await db.from('outreach_settings').select('alert_hot_enabled, alert_to, weekly_digest_to, sender_name, sender_email').eq('id', 1).single();
  const to = s?.alert_to || s?.weekly_digest_to;
  if (!s?.alert_hot_enabled) return { sent: false, skipped: 'alerta desligado' };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !s.sender_email || !s.sender_name) return { sent: false, skipped: 'destinatário ou remetente não configurado' };
  const { data: lead } = await db.from('leads').select('name, company, email, phone, whatsapp').eq('id', leadId).maybeSingle();
  if (!lead) return { sent: false, skipped: 'lead não encontrado' };
  const first = lead.name.trim().split(/\s+/)[0]; const base = appUrl.replace(/\/$/, '');
  const wa = whatsappLink(lead.whatsapp ?? lead.phone, `Olá, ${first}! Aqui é da Muvens Agência. Vi que você pediu o diagnóstico gratuito${lead.company ? ` da ${lead.company}` : ''}. Posso te ajudar por aqui?`);
  const body = [
    'Novo pedido de DIAGNÓSTICO GRATUITO pela página do site', '',
    `${lead.name}${lead.company ? ` — ${lead.company}` : ''}`, `E-mail: ${lead.email ?? '—'}  ·  Telefone: ${lead.whatsapp ?? lead.phone ?? '—'}`,
    `Site: ${ctx.site ?? '—'}  ·  Instagram: ${ctx.instagram ?? '—'}`,
    `Origem: ${ctx.source}${ctx.campaign ? `  ·  Campanha: ${ctx.campaign}` : ''}${ctx.ad ? `  ·  Anúncio: ${ctx.ad}` : ''}`, '',
    ...(ctx.qual ? [`Qualificação: ${ctx.qual.fit.toUpperCase()} (${ctx.qual.score}/100)`, `Maior desafio: ${ctx.qual.a.dificuldade}`, `Áreas: ${ctx.qual.a.areas.map((k) => AREAS.find((x) => x.key === k)?.label ?? k).join(', ') || '—'}`, `Investe hoje: ${lab(INVEST, ctx.qual.a.invest)}  ·  Prazo: ${lab(PRAZO, ctx.qual.a.prazo)}  ·  Decide: ${lab(DECISOR, ctx.qual.a.decisor)}  ·  Prefere: ${ctx.qual.a.contato ? lab(CONTATO, ctx.qual.a.contato) : '—'}`, ''] : []),
    ...(wa ? [`Falar agora pelo WhatsApp: ${wa}`] : []),
    `Abrir o lead no CRM: ${base}/crm/${leadId}`,
  ].join('\n');
  await provider.send({ from: `"Muvens OS" <${s.sender_email}>`, to, subject: `${ctx.qual ? `[${ctx.qual.fit.toUpperCase()}] ` : ''}Diagnóstico gratuito: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`, text: body, html: bodyToHtml(body), unsubscribeUrl: `${base}/prospeccao?tab=config` });
  return { sent: true };
}
