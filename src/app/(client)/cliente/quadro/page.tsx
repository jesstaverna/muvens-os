import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import { CalendarView, KanbanView, ListView, TimelineView } from '@/components/BoardViews';
import { todayBR } from '@/lib/domain';
import { LinkButton } from '@/components/LinkButton';
import type { BoardTask } from '@/lib/projects/board';

export const metadata = { title: 'Quadro de demandas' };
type Board = { projects: { id: string; name: string; status: string }[]; services?: { id: string; name: string }[]; tasks: BoardTask[] };
const VIEWS = [['kanban', 'Quadro'], ['timeline', 'Linha do tempo'], ['lista', 'Lista'], ['calendario', 'Calendário']] as const;

export default async function Quadro({ searchParams }: { searchParams: Promise<{ v?: string; p?: string; s?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_board');
  const board = (data ?? { projects: [], tasks: [] }) as Board;
  const view = VIEWS.some(([k]) => k === sp.v) ? sp.v! : 'kanban';
  const project = board.projects.some((p) => p.id === sp.p) ? sp.p! : '';
  const services = board.services ?? []; const service = services.some((x) => x.id === sp.s) ? sp.s! : '';
  const tasks = board.tasks.filter((t) => (!project || t.project_id === project) && (!service || t.service_id === service));
  const today = todayBR(); const href = (id: string) => `/cliente/quadro/${id}`;
  const q = (v: string, p: string, sv = service) => `/cliente/quadro?v=${v}${p ? `&p=${p}` : ''}${sv ? `&s=${sv}` : ''}`;
  const waiting = board.tasks.filter((t) => t.status === 'enviado' || t.status === 'aguardando_cliente').length;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="h1">Quadro de demandas</h1><p className="mt-1.5 text-sm text-muted">Acompanhe prazos, responsáveis e links. Peça novas demandas e alterações por aqui.</p></div>
        <LinkButton href="/cliente/quadro/nova" className="btn btn-primary">Nova demanda</LinkButton>
      </div>
      {waiting > 0 && <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><b className="text-warn">{waiting} {waiting === 1 ? 'item aguarda' : 'itens aguardam'} você</b> — aprovação ou envio de conteúdo (cartões destacados).</div>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Visualização" className="flex gap-1 rounded-xl bg-subtle p-1">{VIEWS.map(([k, l]) => <Link key={k} href={q(k, project)} aria-current={view === k ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-sm ${view === k ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg'}`}>{l}</Link>)}</nav>
        {board.projects.length > 1 && <nav aria-label="Projeto" className="flex flex-wrap gap-1.5 text-sm"><Link href={q(view, '')} className={`badge ${project ? '' : 'bg-lime/40'}`}>Todos</Link>{board.projects.map((p) => <Link key={p.id} href={q(view, p.id)} className={`badge ${project === p.id ? 'bg-lime/40' : ''}`}>{p.name}</Link>)}</nav>}
      </div>
      {services.length > 0 && <nav aria-label="Serviço" className="mb-5 flex flex-wrap items-center gap-1.5 text-sm"><span className="mr-1 text-xs text-muted">Serviço:</span><Link href={q(view, project, '')} className={`badge ${service ? '' : 'bg-lime/40'}`}>Todos</Link>{services.map((x) => <Link key={x.id} href={q(view, project, x.id)} className={`badge ${service === x.id ? 'bg-lime/40' : ''}`}>{x.name}</Link>)}</nav>}
      {!board.tasks.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">{board.projects.length ? 'Ainda não há demandas. Clique em “Nova demanda” para começar.' : 'Ainda não há projetos compartilhados com você.'}</div>
        : view === 'timeline' ? <TimelineView tasks={tasks} today={today} hrefFor={href} />
        : view === 'lista' ? <ListView tasks={tasks} today={today} hrefFor={href} viewer="cliente" />
        : view === 'calendario' ? <CalendarView tasks={tasks} today={today} hrefFor={href} />
        : <KanbanView tasks={tasks} today={today} hrefFor={href} viewer="cliente" showProject={board.projects.length > 1 && !project} />}
    </>
  );
}
