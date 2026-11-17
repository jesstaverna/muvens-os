import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { dateBR } from '@/lib/format';
import { todayBR } from '@/lib/domain';

export const metadata = { title: 'Aprovações' };
const one = <T,>(value: T | T[] | null | undefined): T | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

export default async function Aprovacoes({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase, profile } = await requireModule('aprovacoes');
  const { status } = await searchParams;
  const filter = status === 'produzido' || status === 'enviado' ? status : null;
  const teamView = profile.role === 'admin' || profile.role === 'comercial';
  const today = todayBR();

  // A equipe enxerga suas atribuições; administradores/comercial acompanham a fila geral.
  const { data: assignments } = teamView ? { data: [] as { task_id: string }[] } :
    await supabase.from('task_assignees').select('task_id').eq('user_id', profile.id).limit(300);
  const ids = [...new Set((assignments ?? []).map((a) => a.task_id))];

  let query = supabase.from('tasks')
    .select('id, title, status, due_on, review_due_on, projects(name, clients(name))', { count: 'exact' })
    .in('status', filter ? [filter] : ['produzido', 'enviado'])
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(80);

  if (!teamView) {
    query = ids.length
      ? query.or('assignee_id.eq.' + profile.id + ',id.in.(' + ids.join(',') + ')')
      : query.eq('assignee_id', profile.id);
  }

  const { data, count, error } = await query;
  const rows = data ?? [];
  const tabs = [
    { label: 'Todas', href: '/aprovacoes', active: !filter },
    { label: 'Revisão interna', href: '/aprovacoes?status=produzido', active: filter === 'produzido' },
    { label: 'Aguardando cliente', href: '/aprovacoes?status=enviado', active: filter === 'enviado' },
  ];

  return (
    <>
      <PageHeader title="Aprovações" subtitle="Peças produzidas para revisão interna e peças enviadas ao cliente."
        actions={<LinkButton href="/projetos?view=kanban">Abrir quadro de produção</LinkButton>} />
      <div className="mb-6 flex flex-wrap gap-2" aria-label="Filtrar aprovações">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={'btn btn-sm ' + (tab.active ? 'btn-dark' : '')}>{tab.label}</Link>
        ))}
      </div>
      {error ? (
        <Empty title="Não foi possível carregar as aprovações" text="Consulte o módulo de Projetos e Tarefas ou tente novamente." />
      ) : !rows.length ? (
        <Empty title="Nenhuma peça nesta etapa" text="As tarefas marcadas como produzidas ou enviadas ao cliente aparecem aqui automaticamente." />
      ) : (
        <div className="card overflow-x-auto !p-0">
          <div className="border-b border-line px-5 py-3 text-xs text-muted">
            {count ?? rows.length} peça(s) nesta visão
            {(count ?? rows.length) > rows.length && ' · exibindo as primeiras ' + rows.length}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line">
              <th className="th">Peça / projeto</th><th className="th">Etapa</th><th className="th">Prazo</th><th className="th">Próximo passo</th>
            </tr></thead>
            <tbody>{rows.map((t) => {
              const project = one(t.projects);
              const client = one(project?.clients);
              const overdue = !!t.due_on && t.due_on < today;
              return (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="td">
                    <Link href={'/projetos/tarefas/' + t.id} className="font-medium underline-offset-4 hover:underline">{t.title}</Link>
                    <div className="mt-1 text-xs text-muted">{[client?.name, project?.name].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="td"><span className="badge">{t.status === 'produzido' ? 'Revisão interna' : 'Enviado ao cliente'}</span></td>
                  <td className={'td ' + (overdue ? 'font-medium text-danger' : 'text-muted')}>
                    {dateBR(t.due_on)}{overdue ? ' · atrasado' : ''}
                  </td>
                  <td className="td">
                    <Link href={'/projetos/tarefas/' + t.id} className="text-sm underline underline-offset-4">
                      {t.status === 'produzido' ? 'Revisar peça' : 'Acompanhar retorno'}
                    </Link>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        O registro de aprovação e os pedidos de ajustes continuam sendo realizados dentro da tarefa, com histórico e permissões.
      </p>
    </>
  );
}
