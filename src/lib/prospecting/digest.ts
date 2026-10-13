import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailProvider } from '@/integrations/email';
import { bodyToHtml } from './message';
import { periods, summarize, type Summary } from './summary';

/** Dia da semana em Brasília (0 = domingo). */
export function brtDow(d: Date): number { const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(d); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w); }

/** Envia às segundas (Brasília); se a segunda foi perdida, envia assim que passar de 8 dias sem resumo. */
export function shouldSendDigest(now: Date, last: Date | null): boolean {
  if (!last) return brtDow(now) === 1;
  const days = (now.getTime() - last.getTime()) / 86400_000;
  return (brtDow(now) === 1 && days >= 6) || days >= 8;
}

const arrow = (c: number, p: number) => (p === 0 ? (c === 0 ? '' : ' (novo)') : ` (${c >= p ? '+' : ''}${Math.round(((c - p) / p) * 100)}% vs. semana anterior)`);

export function digestText(c: Summary, p: Summary, extra: { rascunhos: number; aprovados: number; quentes: number }, appUrl: string) {
  const l = (label: string, a: number, b: number) => `• ${label}: ${a}${arrow(a, b)}`;
  return [
    'Resumo da semana — Muvens OS', '',
    'PROSPECÇÃO', l('Empresas novas', c.novas, p.novas), l('Analisadas', c.analisadas, p.analisadas), l('Prontas (e-mail + WhatsApp)', c.prontas, p.prontas), l('Landings abertas', c.landingAbertas, p.landingAbertas), '',
    'CONTATOS', l('E-mails enviados', c.emailsEnviados, p.emailsEnviados), l('WhatsApp registrados', c.whatsappFeitos, p.whatsappFeitos), l('Respostas', c.respostas, p.respostas), `• E-mails com falha: ${c.falhas}`, '',
    'LEADS NO CRM', l('Leads da prospecção', c.leadsProspeccao, p.leadsProspeccao), l('Leads de anúncios e links', c.leadsAnuncios, p.leadsAnuncios), `• Qualificações respondidas: ${c.qualificacoes} (${c.quentes} quentes, ${c.mornos} mornos, ${c.frios} frios)`, '',
    'PARA FAZER', `• Rascunhos de e-mail aguardando aprovação: ${extra.rascunhos}`, `• E-mails aprovados na fila: ${extra.aprovados}`, `• Leads quentes para enviar proposta: ${extra.quentes}`, '',
    `Abrir o resumo completo: ${appUrl.replace(/\/$/, '')}/prospeccao?tab=resumo`,
  ].join('\n');
}

/** Resumo semanal por e-mail para a equipe (ligado em Configurações de envio). Usa o mesmo provedor e remetente configurados. */
export async function sendWeeklyDigest(db: SupabaseClient, provider: EmailProvider | null, appUrl: string, now = new Date()) {
  if (!provider) return { sent: false, skipped: 'provedor de e-mail não configurado' };
  const { data: s } = await db.from('outreach_settings').select('weekly_digest_enabled, weekly_digest_to, last_digest_at, sender_name, sender_email').eq('id', 1).single();
  if (!s?.weekly_digest_enabled) return { sent: false, skipped: 'resumo semanal desligado' };
  if (!s.weekly_digest_to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.weekly_digest_to) || !s.sender_email || !s.sender_name) return { sent: false, skipped: 'destinatário ou remetente não configurado' };
  if (!shouldSendDigest(now, s.last_digest_at ? new Date(s.last_digest_at) : null)) return { sent: false, skipped: 'ainda não é a hora' };
  const pr = periods(7, now); const [c, p] = [await summarize(db, pr.cur), await summarize(db, pr.prev)];
  const head = (st: string) => db.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', st);
  const [dr, ap, qh] = await Promise.all([head('rascunho'), head('aprovada'), db.from('lead_qualifications').select('lead_id, leads(proposals(id))').eq('fit', 'quente').eq('status', 'respondido').limit(500)]);
  const quentes = ((qh.data ?? []) as any[]).filter((q) => { const l = Array.isArray(q.leads) ? q.leads[0] : q.leads; return !(l?.proposals ?? []).length; }).length;
  const body = digestText(c, p, { rascunhos: dr.count ?? 0, aprovados: ap.count ?? 0, quentes }, appUrl);
  await provider.send({ from: `"Muvens OS" <${s.sender_email}>`, to: s.weekly_digest_to, subject: 'Resumo da semana — Muvens OS', text: body, html: bodyToHtml(body), unsubscribeUrl: `${appUrl.replace(/\/$/, '')}/prospeccao?tab=config` });
  await db.from('outreach_settings').update({ last_digest_at: now.toISOString() }).eq('id', 1);
  return { sent: true };
}
