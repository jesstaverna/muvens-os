// Por que os e-mails não saem? Replica, em linguagem simples, as travas que o banco aplica em claim_outreach + o que depende de configuração externa.
export interface DiagInput {
  settings: { sending_enabled: boolean; require_approval: boolean; sender_name: string | null; sender_email: string | null; company_legal_name: string | null; company_address: string | null; window_start_hour: number; window_end_hour: number; weekdays_only: boolean; daily_email_limit: number } | null;
  providerConfigured: boolean;      // RESEND_API_KEY
  cronSecretConfigured: boolean;    // CRON_SECRET (sem ele o agendador não consegue chamar o worker)
  approved: number; drafts: number; failed: number; sentToday: number;
  lastError?: string | null;
  now?: Date;
}
export interface Check { ok: boolean | null; label: string; fix?: string }

export function brtParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(d);
  const hour = Number(f.find((p) => p.type === 'hour')!.value) % 24; const wd = f.find((p) => p.type === 'weekday')!.value;
  return { hour, weekend: wd === 'Sat' || wd === 'Sun' };
}

export function diagnoseSending(i: DiagInput): Check[] {
  const s = i.settings; const { hour, weekend } = brtParts(i.now ?? new Date());
  if (!s) return [{ ok: false, label: 'Configurações de envio não encontradas', fix: 'Aplique a migração da Prospecção (11) no Supabase.' }];
  const ident = !!(s.sender_name && s.sender_email && s.company_legal_name && s.company_address);
  const inWindow = hour >= s.window_start_hour && hour < s.window_end_hour && !(s.weekdays_only && weekend);
  return [
    { ok: i.providerConfigured, label: 'Provedor de e-mail (Resend) configurado', fix: 'Cadastre RESEND_API_KEY na Vercel e faça um novo deploy. O e-mail de envio precisa ser de um domínio verificado no Resend.' },
    { ok: s.sending_enabled, label: 'Envio automático ligado', fix: 'Em Configurações de envio, marque "Ligar o envio automático" e salve (só administradores).' },
    { ok: ident, label: 'Identificação do remetente completa (nome, e-mail, razão social e endereço)', fix: 'Preencha todos os campos de identificação em Configurações de envio. Sem isso nada é enviado.' },
    { ok: i.approved > 0, label: `E-mails aprovados na fila: ${i.approved}`, fix: s.require_approval ? `Há ${i.drafts} rascunho(s) esperando. Abra o prospecto, revise o e-mail e clique em Aprovar (a aprovação humana é obrigatória nas suas configurações).` : 'Nenhum e-mail aprovado ainda: abra o prospecto e aprove.' },
    { ok: inWindow, label: `Dentro do horário de envio agora (${s.window_start_hour}h–${s.window_end_hour}h${s.weekdays_only ? ', dias úteis' : ''}, horário de Brasília)`, fix: `Agora são ${hour}h em Brasília${weekend && s.weekdays_only ? ' (fim de semana)' : ''}. Os e-mails só saem dentro da janela configurada.` },
    { ok: s.daily_email_limit - i.sentToday > 0, label: `Limite diário: ${i.sentToday} de ${s.daily_email_limit} enviados hoje`, fix: 'O limite diário foi atingido; os próximos saem amanhã.' },
    { ok: i.cronSecretConfigured, label: 'Segredo do agendador (CRON_SECRET) configurado', fix: 'Cadastre CRON_SECRET na Vercel (qualquer texto longo e aleatório) e faça novo deploy.' },
    ...(i.failed > 0 ? [{ ok: false as const, label: `${i.failed} e-mail(s) falharam${i.lastError ? `: ${i.lastError}` : ''}`, fix: 'Veja o erro na coluna Status da fila. Erros comuns: domínio do remetente não verificado no Resend ou chave inválida.' }] : []),
  ];
}
