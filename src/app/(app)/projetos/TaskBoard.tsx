'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveTask } from './actions';

export interface KTask { id: string; title: string; status: string; priority: string; due_on: string | null; assignee: string | null; client: string | null; project: string | null; out_of_scope: boolean; late: boolean }
const COLS = [['a_fazer', 'A fazer'], ['em_andamento', 'Em andamento'], ['produzido', 'Produzido'], ['enviado', 'Enviado ao cliente'], ['ajustes', 'Ajustes'], ['aprovado', 'Aprovado'], ['entregue', 'Entregue']] as const;
const PRI: Record<string, string> = { urgente: 'bg-danger', alta: 'bg-amber-500', media: 'bg-blue-500', baixa: 'bg-muted' };

export function TaskBoard({ tasks }: { tasks: KTask[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function move(id: string, status: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    setError(null);
    start(async () => { const err = await moveTask(id, status); if (err) setError(err); router.refresh(); });
  }
  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div className={`flex gap-4 overflow-x-auto pb-4 ${pending ? 'opacity-70' : ''}`}>
        {COLS.map(([key, label]) => {
          const items = tasks.filter((t) => t.status === key);
          return (
            <section key={key} aria-label={label} onDragOver={(e) => { e.preventDefault(); setOver(key); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), key); }}
              className={`w-72 shrink-0 rounded-2xl border bg-subtle/50 p-3 ${over === key ? 'border-fg' : 'border-line'}`}>
              <header className="mb-3 flex items-baseline justify-between px-1.5"><h3 className="text-sm font-semibold">{label}</h3><span className="text-xs text-muted">{items.length}</span></header>
              <div className="space-y-2.5">
                {items.map((t) => (
                  <article key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="cursor-grab rounded-xl border border-line bg-surface p-3.5 active:cursor-grabbing">
                    <div className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRI[t.priority]}`} title={`Prioridade ${t.priority}`} /><Link href={`/projetos/tarefas/${t.id}`} className="text-sm font-medium hover:underline">{t.title}</Link></div>
                    <div className="mt-1 text-xs text-muted">{t.client}{t.project ? ` · ${t.project}` : ''}</div>
                    <div className="mt-2 flex items-center justify-between text-xs"><span className={t.late ? 'font-medium text-danger' : 'text-muted'}>{t.due_on ? t.due_on.split('-').reverse().slice(0, 2).join('/') : 'Sem prazo'}{t.late ? ' · atrasada' : ''}</span><span className="text-muted">{t.assignee ?? 'Sem resp.'}</span></div>
                    {t.out_of_scope && <div className="mt-2 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] text-warn">Fora do escopo contratado</div>}
                    <label className="sr-only" htmlFor={`mv-${t.id}`}>Mover {t.title}</label>
                    <select id={`mv-${t.id}`} value={t.status} onChange={(e) => move(t.id, e.target.value)} className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs">{COLS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </article>))}
                {!items.length && <p className="px-1.5 py-6 text-center text-xs text-muted">—</p>}
              </div>
            </section>);
        })}
      </div>
    </div>
  );
}
