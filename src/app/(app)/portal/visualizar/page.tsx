import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { CalendarView, ListView, TimelineView } from '@/components/BoardViews';
import { LinkButton } from '@/components/LinkButton';
import { todayBR } from '@/lib/domain';
import type { BoardTask } from '@/lib/projects/board';
import { TrelloBoard } from './TrelloBoard';

export const metadata = { title: 'Ver como o cliente' };
type Board = { client_name: string; projects: { id: string; name: string; status: string }[]; hidden_projects: { id: string; name: string }[]; tasks: BoardTask[] };
const VIEWS = [['kanban', 'Quadro'], ['timeline', 'Linha do tempo'], ['lista', 'Lista'], ['calendario', 'Calendário']] as const;
const NAV = ['Início', 'Quadro', 'Projetos', 'Aprovações', 'Calendário', 'Solicitações', 'Documentos', 'Propostas e contratos'];

export default async function VerComoCliente({ searchParams }: { searchParams: Promise<{ c?: string; v?: string; p?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireModule('portal');
  const { data: clients } = await supabase.from('clients').select('id, name').order('name');
  const clientId = clients?.some((c) => c.id === sp.c) ? sp.c! : '';
  const header = (
    <PageHeader title="Ver como o cliente" subtitle="O quadro do cliente, exatamente como ele vê. Aqui você também cria e move cartões, como no Trello."
      actions={<LinkButton href="/portal" className="btn">← Portal do Cliente</LinkButton>} />
  );
  const picker = (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-2"><select name="c" defaultValue={clientId} className="input w-72" aria-label="Cliente" required><option value="" disabled>Escolha o cliente…</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn btn-dark">Ver</button></form>
  );
  if (!clientId) return <>{header}{picker}<Empty title="Escolha um cliente" text="Você verá o quadro dele como ele vê: só projetos liberados no portal e tarefas que não são internas." /></>;

  const { data } = await supabase.rpc('staff_client_board', { p_client: clientId });
  const b = data as Board | null;
  if (!b) return <>{header}{picker}<Empty title="Não foi possível carregar" text="Rode a atualização T_ver_como_cliente.sql no Supabase." /></>;
  const view = VIEWS.some(([k]) => k === sp.v) ? sp.v! : 'kanban';
  const project = b.projects.some((p) => p.id === sp.p) ? sp.p! : '';
  const tasks = project ? b.tasks.filter((t) => t.project_id === project) : b.tasks;
  const today = todayBR(); const href = (id: string) => `/projetos/tarefas/${id}`;
  const q = (v: string, p: string) => `/portal/visualizar?c=${clientId}&v=${v}${p ? `&p=${p}` : ''}`;
  return (
    <>
      {header}{picker}
      {b.hidden_projects.length > 0 && <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><b className="text-warn">{b.hidden_projects.length === 1 ? '1 projeto não está liberado' : `${b.hidden_projects.length} projetos não estão liberados`} no portal</b> e o cliente não os vê: {b.hidden_projects.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link href={`/projetos/${p.id}`} className="underline">{p.name}</Link></span>)}. Abra o projeto e marque “visível no portal”.</div>}
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-subtle/60 px-4 py-3">
          <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-fg text-xs font-bold text-lime">M</span><div className="leading-tight"><div className="text-sm font-semibold">Portal do Cliente</div><div className="text-[11px] text-muted">{b.client_name} · Muvens Agência</div></div></div>
          <span className="badge bg-lime/40">Visão do cliente</span>
        </div>
        <nav aria-hidden className="flex gap-1 overflow-x-auto border-b border-line px-3 text-sm">{NAV.map((n) => <span key={n} className={`whitespace-nowrap px-3 py-2.5 ${n === 'Quadro' ? 'border-b-2 border-fg font-medium' : 'text-muted'}`}>{n}</span>)}</nav>
        <div className="p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Visualização" className="flex gap-1 rounded-xl bg-subtle p-1">{VIEWS.map(([k, l]) => <Link key={k} href={q(k, project)} aria-current={view === k ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-sm ${view === k ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg'}`}>{l}</Link>)}</nav>
            {b.projects.length > 1 && <nav aria-label="Projeto" className="flex flex-wrap gap-1.5 text-sm"><Link href={q(view, '')} className={`badge ${project ? '' : 'bg-lime/40'}`}>Todos</Link>{b.projects.map((p) => <Link key={p.id} href={q(view, p.id)} className={`badge ${project === p.id ? 'bg-lime/40' : ''}`}>{p.name}</Link>)}</nav>}
          </div>
          {!b.projects.length ? <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Este cliente ainda não tem projeto liberado no portal. Marque “visível no portal” em um projeto dele para criar cartões aqui.</div>
            : view === 'timeline' ? <TimelineView tasks={tasks} today={today} hrefFor={href} />
            : view === 'lista' ? <ListView tasks={tasks} today={today} hrefFor={href} viewer="cliente" />
            : view === 'calendario' ? <CalendarView tasks={tasks} today={today} hrefFor={href} />
            : <TrelloBoard tasks={tasks} projects={project ? b.projects.filter((p) => p.id === project) : b.projects} clientId={clientId} today={today} />}
        </div>
      </div>
    </>
  );
}
