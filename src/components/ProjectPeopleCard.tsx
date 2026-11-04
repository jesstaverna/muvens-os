import Link from 'next/link';
import type { ProjectPeople } from '@/lib/projects/people';

const dot = (n: string, solid: boolean) => <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${solid ? 'bg-fg text-lime' : 'border border-line'}`}>{n.trim().charAt(0).toUpperCase()}</span>;

/** Quem participa de um projeto: equipe, contatos do cliente nas tarefas e usuários do portal com acesso. */
export function ProjectPeopleCard({ data, showTitle = false }: { data: ProjectPeople; showTitle?: boolean }) {
  const { team, contacts, portalUsers, project } = data;
  return (
    <section className="card">
      {showTitle && <h2 className="mb-1 text-base font-semibold"><Link href={`/projetos/${project.id}`} className="hover:underline">{project.name}</Link></h2>}
      {showTitle && <p className="mb-4 text-xs text-muted">{project.client}{project.client_visible ? ' · liberado no portal' : ' · não liberado no portal'}</p>}
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Equipe Muvens ({team.length})</h3>
      <ul className="mb-5 space-y-2 text-sm">{team.map((t) => (<li key={t.id} className="flex items-center gap-2">{dot(t.name, true)}<span className="min-w-0 truncate">{t.name}</span><span className="ml-auto shrink-0 text-right text-xs text-muted">{t.role}{t.tasks > 0 ? ` · ${t.open} aberta${t.open === 1 ? '' : 's'} de ${t.tasks}` : ''}</span></li>))}{!team.length && <li className="text-sm text-muted">Nenhuma pessoa da equipe nas tarefas ainda.</li>}</ul>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Contatos do cliente nas tarefas ({contacts.length})</h3>
      <ul className="mb-5 space-y-2 text-sm">{contacts.map((c) => (<li key={c.id} className="flex items-center gap-2">{dot(c.name, false)}<span className="min-w-0 truncate">{c.name}{c.role_title ? <span className="text-muted"> · {c.role_title}</span> : null}</span><span className="ml-auto shrink-0 text-xs text-muted">{c.primary ? 'Responsável · ' : ''}{c.tasks} tarefa{c.tasks === 1 ? '' : 's'}</span></li>))}{!contacts.length && <li className="text-sm text-muted">Nenhum contato marcado nas tarefas.</li>}</ul>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Usuários do portal com acesso ({portalUsers.length})</h3>
      <ul className="space-y-2 text-sm">{portalUsers.map((u) => (<li key={u.id} className={`flex items-center gap-2 ${u.active ? '' : 'opacity-60'}`}>{dot(u.name, false)}<span className="min-w-0 truncate">{u.name}<span className="block truncate text-xs text-muted">{u.email}</span></span><span className="ml-auto shrink-0 text-xs text-muted">{u.active ? 'ativo' : 'inativo'}</span></li>))}
        {!portalUsers.length && <li className="text-sm text-muted">{project.client_visible ? <>Ninguém do cliente tem acesso ainda. <Link href="/portal?tab=acessos" className="underline">Criar acesso</Link></> : 'Projeto não liberado no portal: o cliente não vê este projeto.'}</li>}</ul>
    </section>
  );
}
