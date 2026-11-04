'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Card } from '@/components/BoardViews';
import { COLUMNS, columnOf, lateness, type BoardTask } from '@/lib/projects/board';
import { addCard, moveCard } from './actions';

const TONE: Record<string, string> = { diagramacao: 'bg-violet-500', social_media: 'bg-pink-500', outro: 'bg-muted', andamento: 'bg-blue-500', aprovacao: 'bg-amber-500', ajustes: 'bg-danger', aprovados: 'bg-lime', finalizados: 'bg-ok' };
const CAN_ADD = ['diagramacao', 'social_media', 'andamento'];

/** Quadro da visão do cliente com edição estilo Trello: arrastar para mudar de coluna e "+ Adicionar cartão" em cada coluna de entrada. */
export function TrelloBoard({ tasks, projects, clientId, today }: { tasks: BoardTask[]; projects: { id: string; name: string }[]; clientId: string; today: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); const [title, setTitle] = useState(''); const [project, setProject] = useState(projects[0]?.id ?? '');
  const cols = COLUMNS.filter((c) => c.key !== 'outro' || tasks.some((t) => columnOf(t) === 'outro'));

  const move = (id: string, col: string) => { const t = tasks.find((x) => x.id === id); if (!t || columnOf(t) === col) return; setError(null); start(async () => { const e = await moveCard(id, col); if (e) setError(e); router.refresh(); }); };
  const add = (col: string) => { if (!title.trim()) return; setError(null); start(async () => { const e = await addCard(clientId, project, col, title); if (e) setError(e); else { setTitle(''); setAdding(null); } router.refresh(); }); };

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div className={`flex gap-4 overflow-x-auto pb-4 ${pending ? 'opacity-70' : ''}`}>
        {cols.map((c) => {
          const items = tasks.filter((t) => columnOf(t) === c.key).sort((a, b) => lateness(b, today).days - lateness(a, today).days);
          return (
            <section key={c.key} aria-label={c.label} onDragOver={(e) => { e.preventDefault(); setOver(c.key); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), c.key); }}
              className={`w-64 shrink-0 rounded-2xl border bg-subtle/50 p-3 ${over === c.key ? 'border-fg' : 'border-line'}`}>
              <header className="mb-3 flex items-center justify-between px-1.5"><h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${TONE[c.key]}`} />{c.label}</h3><span className="text-xs text-muted">{items.length}</span></header>
              <div className="space-y-2.5">
                {items.map((t) => <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="cursor-grab active:cursor-grabbing"><Card t={t} href={`/projetos/tarefas/${t.id}`} today={today} viewer="cliente" showProject={projects.length > 1} /></div>)}
                {!items.length && adding !== c.key && <p className="px-1.5 py-4 text-center text-xs text-muted">—</p>}
              </div>
              {CAN_ADD.includes(c.key) && projects.length > 0 && (adding === c.key ? (
                <form onSubmit={(e) => { e.preventDefault(); add(c.key); }} className="mt-2.5 space-y-2 rounded-xl border border-line bg-surface p-2.5">
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do cartão…" maxLength={200} className="input !py-1.5 text-sm" aria-label="Título do cartão" />
                  {projects.length > 1 && <select value={project} onChange={(e) => setProject(e.target.value)} className="input !py-1.5 text-xs" aria-label="Projeto">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                  <div className="flex gap-2"><button className="btn btn-sm btn-primary" disabled={pending || !title.trim()}>Adicionar</button><button type="button" className="btn btn-sm" onClick={() => { setAdding(null); setTitle(''); }}>Cancelar</button></div>
                </form>
              ) : <button type="button" onClick={() => { setAdding(c.key); setTitle(''); }} className="mt-2.5 w-full rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-surface hover:text-fg">+ Adicionar cartão</button>)}
            </section>);
        })}
      </div>
      <p className="mt-1 text-xs text-muted">Arraste os cartões entre as colunas. Ao levar para “Aprovação”, a peça é enviada ao cliente; ao levar para “Aprovados”/“Finalizados”, o sistema registra as etapas intermediárias.</p>
    </div>
  );
}
