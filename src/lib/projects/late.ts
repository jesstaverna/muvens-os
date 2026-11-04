import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailProvider } from '@/integrations/email';
import { bodyToHtml } from '@/lib/prospecting/message';
import { todayBR } from '@/lib/domain';

interface Delay { task_id: string; title: string; project: string; client_id: string; client_name: string; assignee_id: string | null; assignee_name: string | null; assignee_email: string | null; side: 'equipe' | 'cliente'; due: string; days_late: number; status: string }
const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const days = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);
const WHAT: Record<string, string> = { enviado: 'devolver a revisão', aguardando_cliente: 'enviar o conteúdo', ajustes: 'entregar as alterações' };
const REPEAT_AFTER_DAYS = 3;   // a mesma tarefa só volta a ser avisada depois de 3 dias

/**
 * Avisos de atraso por e-mail (rodam no worker diário). Dois públicos, cada um ligado em separado:
 *  - equipe (Projetos > Avisos): resumo para o destinatário dos alertas e um e-mail por responsável com as tarefas dele;
 *  - cliente: lembrete aos usuários do portal sobre aprovações/conteúdos que dependem deles.
 * Cada tarefa é avisada uma vez e só repete após 3 dias (ou se mudar de etapa).
 */
export async function sendLateTaskEmails(db: SupabaseClient, provider: EmailProvider | null, base: string, now = new Date()) {
  const { data: cfg } = await db.from('board_settings').select('late_email_team, late_email_client').eq('id', 1).maybeSingle();
  if (!cfg?.late_email_team && !cfg?.late_email_client) return { skipped: 'avisos desligados' };
  if (!provider) return { skipped: 'provedor de e-mail não configurado' };
  const { data: s } = await db.from('outreach_settings').select('sender_name, sender_email, alert_to, weekly_digest_to').eq('id', 1).maybeSingle();
  if (!s?.sender_email || !s.sender_name) return { skipped: 'remetente não configurado (Prospecção > Configurações de envio)' };
  const { data: rows, error } = await db.rpc('task_delays');
  if (error) throw new Error(error.message);
  const delays = (rows ?? []) as Delay[];
  if (!delays.length) return { team: 0, client: 0 };

  const today = todayBR(now); const cutoff = todayBR(new Date(now.getTime() - REPEAT_AFTER_DAYS * 86_400_000));
  const { data: marks } = await db.from('tasks').select('id, late_team_notified_on, late_client_notified_on').in('id', delays.map((d) => d.task_id));
  const mark = new Map((marks ?? []).map((m) => [m.id as string, m as { late_team_notified_on: string | null; late_client_notified_on: string | null }]));
  const due = (d: Delay, who: 'team' | 'client') => { const m = mark.get(d.task_id)?.[who === 'team' ? 'late_team_notified_on' : 'late_client_notified_on']; return !m || m <= cutoff; };
  const from = `"${s.sender_name.replace(/"/g, '')}" <${s.sender_email}>`; const root = base.replace(/\/$/, '');
  const out = { team: 0, client: 0, errors: 0 };

  const send = async (to: string, subject: string, lines: string[], unsub: string) => { const text = lines.join('\n'); await provider.send({ from, to, subject, text, html: bodyToHtml(text), unsubscribeUrl: unsub }); };
  const done = async (ids: string[], col: 'late_team_notified_on' | 'late_client_notified_on') => { if (ids.length) await db.from('tasks').update({ [col]: today }).in('id', ids); };

  if (cfg.late_email_team) {
    const items = delays.filter((d) => due(d, 'team'));
    const line = (d: Delay) => d.side === 'cliente'
      ? `• ${d.title} (${d.client_name} · ${d.project}) — cliente ${d.status === 'enviado' ? 'não devolveu a revisão' : 'não enviou o conteúdo'} há ${days(d.days_late)}`
      : `• ${d.title} (${d.client_name} · ${d.project}) — ${d.status === 'ajustes' ? 'alterações' : 'entrega'} atrasada há ${days(d.days_late)}${d.assignee_name ? ` · ${d.assignee_name}` : ' · sem responsável'}`;
    const link = (d: Delay) => `${root}/projetos/tarefas/${d.task_id}`;
    const to = s.alert_to || s.weekly_digest_to;
    if (items.length && to && MAIL.test(to)) {
      try {
        const own = items.filter((d) => d.side === 'equipe'), cli = items.filter((d) => d.side === 'cliente');
        await send(to, `${items.length} ${items.length === 1 ? 'demanda em atraso' : 'demandas em atraso'}`, [
          ...(own.length ? ['A EQUIPE ESTÁ DEVENDO', ...own.flatMap((d) => [line(d), `  ${link(d)}`]), ''] : []),
          ...(cli.length ? ['AGUARDANDO O CLIENTE (atrasado)', ...cli.flatMap((d) => [line(d), `  ${link(d)}`]), ''] : []),
          `Ver o quadro: ${root}/projetos?view=timeline`], `${root}/projetos`);
        out.team++;
      } catch { out.errors++; }
    }
    // um e-mail por responsável, só com as tarefas dele (evita repetir o destinatário do resumo)
    const byPerson = new Map<string, Delay[]>();
    for (const d of items.filter((x) => x.side === 'equipe' && x.assignee_email && MAIL.test(x.assignee_email))) byPerson.set(d.assignee_email!, [...(byPerson.get(d.assignee_email!) ?? []), d]);
    for (const [mail, list] of byPerson) {
      if (mail.toLowerCase() === String(to).toLowerCase()) continue;
      try { await send(mail, `Você tem ${list.length} ${list.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`, [`Olá, ${list[0].assignee_name?.split(' ')[0] ?? ''}!`, '', ...list.flatMap((d) => [line(d), `  ${link(d)}`]), ''], `${root}/projetos`); out.team++; } catch { out.errors++; }
    }
    if (!out.errors) await done(items.map((d) => d.task_id), 'late_team_notified_on');
  }

  if (cfg.late_email_client) {
    const items = delays.filter((d) => d.side === 'cliente' && due(d, 'client'));
    const byClient = new Map<string, Delay[]>();
    for (const d of items) byClient.set(d.client_id, [...(byClient.get(d.client_id) ?? []), d]);
    const sent: string[] = [];
    for (const [clientId, list] of byClient) {
      const { data: users } = await db.from('profiles').select('email, full_name').eq('role', 'cliente').eq('client_id', clientId).eq('active', true);
      const to = (users ?? []).map((u) => u.email as string | null).filter((m): m is string => !!m && MAIL.test(m));
      if (!to.length) continue;
      const lines = ['Olá!', '', `Algumas demandas da ${list[0].client_name} estão aguardando você:`, '',
        ...list.flatMap((d) => [`• ${d.title} — falta ${WHAT[d.status] ?? 'responder'} (combinado para ${d.due.split('-').reverse().join('/')}, ${days(d.days_late)} de atraso)`, `  ${root}/cliente/quadro/${d.task_id}`]), '',
        'Quando você responde, a equipe consegue seguir com a produção no prazo.', '', s.sender_name];
      let ok = false;
      for (const m of to) { try { await send(m, `${list.length === 1 ? 'Uma demanda aguarda' : `${list.length} demandas aguardam`} você`, lines, `${root}/cliente`); ok = true; out.client++; } catch { out.errors++; } }
      if (ok) sent.push(...list.map((d) => d.task_id));
    }
    await done(sent, 'late_client_notified_on');
  }
  return out;
}
