import Link from 'next/link';
import { AlertCircle, CalendarDays, ClipboardCheck, ListTodo } from 'lucide-react';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { dateBR, dateTimeBR } from '@/lib/format';
import { PRIORITY, TASK_STATUS, todayBR } from '@/lib/domain';

export const metadata = { title: 'Meu Dia' };
const ACTIVE_TASK_STATUSES = [
  'solicitada', 'aguardando_cliente', 'a_fazer',
  'em_andamento', 'produzido', 'enviado', 'ajustes',
];

const one = <T,>(value: T | T[] | null | undefined): T | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

export default async function MeuDia() {
  const { supabase, profile } = await requireModule('meu-dia');
  const today = todayBR();
  const salesAccess = profile.role === 'admin' || profile.role === 'comercial';
  const approvalsAccess = ['admin', 'comercial', 'designer', 'trafego'].includes(profile.role);
  const teamApprovals = profile.role === 'admin' || profile.role === 'comercial';

  const { data: collaborators } = await supabase.from('task_assignees')
    .select('task_id').eq('user_id', profile.id).limit(300);
  const assignedIds = [...new Set((collaborators ?? []).map((r) => r.task_id))];

  // Tarefas individuais incluem responsabilidade principal e co-responsabilidade.
  let myTasksQuery = supabase.from('tasks')
    .select('id, title, status, priority, due_on, projects(name, clients(name))', { count: 'exact' })
    .in('status', ACTIVE_TASK_STATUSES)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(12);
  if (assignedIds.length) {
    myTasksQuery = myTasksQuery.or('assignee_id.eq.' + profile.id + ',id.in.(' + assignedIds.join(',') + ')');
  } else {
    myTasksQuery = myTasksQuery.eq('assignee_id', profile.id);
  }

  let approvalsQuery = supabase.from('tasks')
    .select('id, title, status, due_on, projects(name, clients(name))', { count: 'exact' })
    .in('status', ['produzido', 'enviado'])
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(6);
  if (!teamApprovals) {
    approvalsQuery = assignedIds.length
      ? approvalsQuery.or('assignee_id.eq.' + profile.id + ',id.in.(' + assignedIds.join(',') + ')')
      : approvalsQuery.eq('assignee_id', profile.id);
  }

  const [
    myTasksResult,
    alertsResult,
    approvalsResult,
    proposalsResult,
    remindersResult,
  ] = await Promise.all([
    myTasksQuery,
    supabase.from('notifications')
      .select('id, title, severity, link, created_at', { count: 'exact' })
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
    approvalsAccess ? approvalsQuery : Promise.resolve({ data: [], count: 0, error: null }),
    salesAccess ? supabase.from('proposals')
      .select('id, title, client_display_name, status, valid_until', { count: 'exact' })
      .in('status', ['enviada', 'visualizada', 'em_negociacao'])
      .order('valid_until', { ascending: true, nullsFirst: false })
      .limit(5) : Promise.resolve({ data: [], count: 0, error: null }),
    salesAccess ? supabase.from('lead_reminders')
      .select('id, title, due_at, lead_id, leads(name)', { count: 'exact' })
      .is('done_at', null).lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true }).limit(5)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]);

  const tasks = myTasksResult.data ?? [];
  const alerts = alertsResult.data ?? [];
  const approvals = approvalsResult.data ?? [];
  const proposals = proposalsResult.data ?? [];
  const reminders = remindersResult.data ?? [];
  const tasksCount = myTasksResult.count ?? tasks.length;
  const approvalsCount = approvalsResult.count ?? approvals.length;
  const alertsCount = alertsResult.count ?? alerts.length;
  const hasReadError = Boolean(
    myTasksResult.error || alertsResult.error || approvalsResult.error ||
    proposalsResult.error || remindersResult.error
  );

  return (
    <>
      <PageHeader title="Meu Dia" subtitle={'Sua central de trabalho · ' + dateBR(today)}
        actions={<>
          <LinkButton href="/projetos?view=lista&me=1">Minhas tarefas</LinkButton>
          {salesAccess && <LinkButton href="/crm" className="btn">CRM</LinkButton>}
          <LinkButton href="/dashboard" className="btn">Dashboard executivo</LinkButton>
        </>} />

      {hasReadError && (
        <div role="alert" className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-warn">
          Alguns indicadores não puderam ser carregados. Consulte os módulos de origem para conferir os dados.
        </div>
      )}

      <section className="mb-7 grid gap-3 sm:grid-cols-3" aria-label="Resumo de trabalho">
        <SummaryCard href="/projetos?view=lista&me=1" icon={<ListTodo className="h-5 w-5" />} title="Minhas tarefas ativas" count={tasksCount} />
        {approvalsAccess && <SummaryCard href="/aprovacoes" icon={<ClipboardCheck className="h-5 w-5" />} title="Peças em aprovação" count={approvalsCount} />}
        <SummaryCard href="/alertas" icon={<AlertCircle className="h-5 w-5" />} title="Alertas não lidos" count={alertsCount} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Minhas prioridades</h2>
              <p className="mt-1 text-xs text-muted">Tarefas atribuídas a você, ordenadas pelo prazo; atrasadas primeiro.</p></div>
            <Link href="/projetos?view=lista&me=1" className="text-sm font-medium underline underline-offset-4">Ver todas</Link>
          </div>
          {tasks.length === 0 ? (
            <Empty title="Nenhuma tarefa ativa atribuída a você"
              text="Tarefas novas aparecerão aqui quando você for designado como responsável ou colaborador." />
          ) : (
            <ul className="divide-y divide-line">
              {tasks.map((task) => {
                const project = one(task.projects);
                const client = one(project?.clients);
                const overdue = !!task.due_on && task.due_on < today;
                return (
                  <li key={task.id}>
                    <Link href={'/projetos/tarefas/' + task.id} className="flex items-start justify-between gap-4 rounded-lg py-3 transition hover:bg-subtle">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{task.title}</div>
                        <p className="mt-0.5 text-xs text-muted">{[client?.name, project?.name].filter(Boolean).join(' · ') || 'Projeto não identificado'}</p>
                        <p className="mt-1.5 text-xs text-muted">{TASK_STATUS[task.status]?.label ?? task.status} · Prioridade: {PRIORITY[task.priority]?.label ?? task.priority}</p>
                      </div>
                      <span className={'shrink-0 text-xs ' + (overdue ? 'font-semibold text-danger' : 'text-muted')}>
                        {task.due_on ? (overdue ? 'Atrasada · ' : '') + dateBR(task.due_on) : 'Sem prazo'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Alertas importantes</h2>
            <Link href="/alertas" className="text-sm font-medium underline underline-offset-4">Ver todos</Link>
          </div>
          {!alerts.length ? (
            <p className="py-7 text-sm text-muted">Nenhum alerta não lido.</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((alert) => (
                <li key={alert.id} className="rounded-xl border border-line p-3">
                  <div className={'text-xs font-medium ' + (alert.severity === 'critical' ? 'text-danger' : 'text-muted')}>
                    {alert.severity === 'critical' ? 'Crítico' : alert.severity === 'warning' ? 'Atenção' : 'Info'}
                  </div>
                  <p className="mt-1 text-sm font-medium">{alert.title}</p>
                  <p className="mt-1 text-xs text-muted">{dateTimeBR(alert.created_at)}</p>
                  <Link href={alert.link?.startsWith('/') && !alert.link.startsWith('//') ? alert.link : '/alertas'}
                    className="mt-2 inline-block text-xs font-semibold underline underline-offset-4">Abrir</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {approvalsAccess && (
        <section className="card mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Revisões e aprovações</h2>
              <p className="mt-1 text-xs text-muted">Peças em revisão interna ou enviadas ao cliente para aprovação.</p></div>
            <LinkButton href="/aprovacoes" className="btn btn-sm">Ver aprovações</LinkButton>
          </div>
          {!approvals.length ? <p className="py-5 text-sm text-muted">Nenhuma peça aguardando aprovação nesta visão.</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {approvals.map((task) => (
                <li key={task.id}>
                  <Link href={'/projetos/tarefas/' + task.id} className="block h-full rounded-xl border border-line p-4 hover:bg-subtle">
                    <span className="badge">{task.status === 'produzido' ? 'Revisão interna' : 'Aguardando cliente'}</span>
                    <div className="mt-2 text-sm font-medium">{task.title}</div>
                    <div className="mt-1 text-xs text-muted">{dateBR(task.due_on)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {salesAccess && (
        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Propostas em aberto</h2>
              <Link href="/propostas" className="text-sm underline underline-offset-4">Ver propostas</Link>
            </div>
            {!proposals.length ? <p className="py-4 text-sm text-muted">Nenhuma proposta em aberto.</p> : (
              <ul className="divide-y divide-line">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <Link href={'/propostas/' + p.id} className="flex items-start justify-between gap-3 py-3 hover:underline">
                      <div><div className="text-sm font-medium">{p.title}</div>
                        <div className="mt-1 text-xs text-muted">{p.client_display_name}</div></div>
                      <span className="shrink-0 text-xs text-muted">Validade {dateBR(p.valid_until)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Follow-ups vencidos</h2>
              <Link href="/crm?view=calendario" className="text-sm underline underline-offset-4">Abrir agenda</Link>
            </div>
            {!reminders.length ? <p className="py-4 text-sm text-muted">Nenhum lembrete vencido no CRM.</p> : (
              <ul className="divide-y divide-line">
                {reminders.map((reminder) => (
                  <li key={reminder.id}>
                    <Link href={'/crm/' + reminder.lead_id} className="flex items-start justify-between gap-3 py-3 hover:underline">
                      <div className="text-sm font-medium">{reminder.title}</div>
                      <span className="shrink-0 text-xs text-danger">{dateTimeBR(reminder.due_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <CalendarDays className="h-4 w-4" aria-hidden />
        As informações vêm dos registros reais de tarefas, aprovações, propostas, CRM e alertas. Sua visibilidade depende do seu perfil.
      </p>
    </>
  );
}

function SummaryCard({ href, icon, title, count }: {
  href: string; icon: React.ReactNode; title: string; count: number;
}) {
  return (
    <Link href={href} className="card flex items-center justify-between gap-3 hover:bg-subtle">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
        <div className="mt-3 text-3xl font-semibold">{count}</div>
      </div>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-lime/30 text-fg">{icon}</span>
    </Link>
  );
}
