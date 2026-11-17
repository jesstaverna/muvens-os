import Link from 'next/link';
import { ArrowUpRight, CalendarDays, FolderKanban, Plus } from 'lucide-react';
import { Empty, Stat } from '@/components/ui';
import { dateBR } from '@/lib/format';
import { PROJECT_STATUS, TASK_STATUS } from '@/lib/domain';
import { isOpenTask, productionSummary, type ProductionTask } from '@/lib/projects/production';

export interface ProductionProject {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  status: string;
  due_on: string | null;
  owner_name: string | null;
}

type Props<T extends ProductionTask> = {
  tasks: T[];
  projects: ProductionProject[];
  today: string;
  canWrite: boolean;
  focusUrl: (focus: string) => string;
  filterActive: boolean;
};

export function ProductionOverview<T extends ProductionTask>({
  tasks, projects, today, canWrite, focusUrl, filterActive,
}: Props<T>) {
  const stats = productionSummary(tasks, today);
  const late = tasks.filter((t) => isOpenTask(t) && t.late)
    .sort((a, b) => (a.effective_due ?? '').localeCompare(b.effective_due ?? ''))
    .slice(0, 6);
  const review = tasks.filter((t) => t.status === 'enviado' || t.status === 'produzido')
    .sort((a, b) => (a.effective_due ?? '9999').localeCompare(b.effective_due ?? '9999'))
    .slice(0, 5);
  const dueSoon = stats.upcoming.slice(0, 5);
  const filteredProjects = projects.slice(0, 8);

  return <div className="space-y-7">
    <section aria-label="Indicadores de produção">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-base font-semibold">Panorama da operação</h2><p className="mt-0.5 text-xs text-muted">Somente tarefas visíveis nos filtros atuais. Os atrasos descontam a espera do cliente.</p></div>
        <span className="text-xs text-muted">{dateBR(today)}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Tarefas abertas" value={stats.open} href={focusUrl('todas')} hint="Produção e demandas pendentes" />
        <Stat label="Atrasadas" value={stats.late} tone={stats.late ? 'danger' : undefined} href={focusUrl('atrasadas')} hint="Prazo ajustado vencido" />
        <Stat label="Em revisão ou aprovação" value={stats.review} href={focusUrl('revisao')} hint="Produzidas ou enviadas ao cliente" />
        <Stat label="Aguardando conteúdo" value={stats.clientWaiting} href={focusUrl('aguardando_cliente')} hint="Pendências do cliente" />
        <Stat label="Sem responsável" value={stats.noOwner} tone={stats.noOwner ? 'danger' : undefined} href={focusUrl('sem_responsavel')} hint="Atribuição necessária" />
        <Stat label="Próximos 7 dias" value={stats.upcoming.length} href={focusUrl('proximos7')} hint={stats.today + ' com prazo hoje'} />
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">Atenção imediata</h2><p className="mt-1 text-xs text-muted">Prazos vencidos · responsáveis e clientes</p></div>
          <Link href={focusUrl('atrasadas')} className="text-xs font-medium underline underline-offset-4">Ver todas</Link>
        </div>
        {late.length ? <ul className="divide-y divide-line">
          {late.map((t) => <li key={t.id}>
            <Link href={'/projetos/tarefas/' + t.id} className="flex items-start justify-between gap-3 py-3 hover:underline">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{t.title}</span>
                <span className="mt-1 block truncate text-xs text-muted">{t.client || 'Cliente'} · {t.project || 'Projeto'} · {t.assignee || t.assignees.join(', ') || 'Sem responsável'}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-danger">{dateBR(t.effective_due)}</span>
            </Link>
          </li>)}
        </ul> : <p className="py-6 text-sm text-muted">Nenhuma tarefa em atraso dentro dos filtros.</p>}
      </section>
      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">Próximas entregas</h2><p className="mt-1 text-xs text-muted">De hoje até os próximos sete dias</p></div>
          <Link href={focusUrl('proximos7')} className="text-xs font-medium underline underline-offset-4">Ver agenda</Link>
        </div>
        {dueSoon.length ? <ul className="divide-y divide-line">
          {dueSoon.map((t) => <li key={t.id}>
            <Link href={'/projetos/tarefas/' + t.id} className="flex items-start justify-between gap-3 py-3 hover:underline">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="mt-1 block truncate text-xs text-muted">{t.project || 'Projeto'} · {TASK_STATUS[t.status]?.label ?? t.status}</span></span>
              <span className="shrink-0 whitespace-nowrap text-xs text-muted">{dateBR(t.effective_due)}</span>
            </Link>
          </li>)}
        </ul> : <p className="py-6 text-sm text-muted">Nenhum prazo programado para esta semana.</p>}
      </section>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">Projetos por cliente</h2><p className="mt-1 text-xs text-muted">Projetos vinculados ao cadastro do Cliente 360°</p></div>
          <Link href="/projetos?view=projetos" className="text-xs font-medium underline underline-offset-4">Todos os projetos</Link>
        </div>
        {!filteredProjects.length ? <Empty title="Nenhum projeto" text={filterActive ? 'Nenhum projeto corresponde ao cliente ou projeto selecionado.' : 'Cadastre o primeiro projeto para acompanhar a produção.'} /> :
          <div className="grid gap-3 sm:grid-cols-2">{filteredProjects.map((p) => {
            const own = tasks.filter((t) => t.project_id === p.id);
            const open = own.filter(isOpenTask).length;
            const late = own.filter((t) => isOpenTask(t) && t.late).length;
            return <div key={p.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-2"><Link href={'/projetos/' + p.id} className="text-sm font-semibold underline-offset-4 hover:underline">{p.name}</Link>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" /></div>
              <Link href={'/clientes/' + p.client_id} className="mt-1 block truncate text-xs text-muted hover:underline">{p.client_name}</Link>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="badge text-[11px]">{PROJECT_STATUS[p.status] ?? p.status}</span>
                <span className="text-xs text-muted">{open} ativa(s){late ? <span className="font-semibold text-danger"> · {late} atrasada(s)</span> : ''}</span>
              </div>
            </div>;
          })}</div>}
        {projects.length > filteredProjects.length && <p className="mt-3 text-xs text-muted">Exibindo {filteredProjects.length} de {projects.length} projetos. Acesse a lista completa.</p>}
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3"><div>
          <h2 className="text-base font-semibold">Fila de aprovações</h2>
          <p className="mt-1 text-xs text-muted">Peças produzidas ou enviadas ao cliente</p>
        </div><Link href={focusUrl('revisao')} className="text-xs font-medium underline underline-offset-4">Ver fila</Link></div>
        {review.length ? <ul className="divide-y divide-line">{review.map((t) => <li key={t.id}>
          <Link href={'/projetos/tarefas/' + t.id} className="block py-3 hover:underline">
            <span className="block text-sm font-medium">{t.title}</span>
            <span className="mt-1 block text-xs text-muted">{TASK_STATUS[t.status]?.label ?? t.status} · {t.client || 'Cliente'} </span>
          </Link></li>)}</ul> : <p className="py-5 text-sm text-muted">Nenhuma demanda nesta etapa.</p>}
        <div className="mt-5 border-t border-line pt-4">
          <Link href="/calendario" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4"><CalendarDays className="h-4 w-4" /> Calendário de produção</Link>
          {canWrite && <Link href="/projetos/tarefas/nova" className="mt-3 inline-flex w-full items-center gap-2 text-sm font-medium underline underline-offset-4"><Plus className="h-4 w-4" /> Criar tarefa</Link>}
        </div>
      </section>
    </div>
    <p className="text-xs text-muted">O painel resume até 1.000 tarefas recuperadas por consulta. O calendário mostra prazos das tarefas, não publicações agendadas em redes sociais.</p>
  </div>;
}
