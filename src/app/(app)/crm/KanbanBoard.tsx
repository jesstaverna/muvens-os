'use client';
import { DiagTag } from '@/components/DiagTag';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveLead } from './actions';

export interface KLead { id: string; name: string; company: string | null; potential_value: number; owner: string | null; stage_id: string; daysSinceContact: number; stale: boolean; diag?: boolean }
export interface KStage { id: string; name: string; kind: 'open' | 'won' | 'lost' }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function KanbanBoard({ stages, leads }: { stages: KStage[]; leads: KLead[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function move(leadId: string, stage: KStage) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage_id === stage.id) return;
    let reason: string | undefined;
    if (stage.kind === 'lost') {
      const r = window.prompt('Motivo da perda (obrigatório):');
      if (!r?.trim()) return;
      reason = r;
    }
    setError(null);
    start(async () => {
      const err = await moveLead(leadId, stage.id, reason);
      if (err) setError(err);
      router.refresh();
    });
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div className={`flex gap-4 overflow-x-auto pb-4 ${pending ? 'opacity-70' : ''}`}>
        {stages.map((s) => {
          const items = leads.filter((l) => l.stage_id === s.id);
          const total = items.reduce((a, l) => a + Number(l.potential_value), 0);
          return (
            <section key={s.id} aria-label={s.name}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), s); }}
              className={`w-72 shrink-0 rounded-2xl border bg-subtle/50 p-3 ${over === s.id ? 'border-fg' : 'border-line'}`}>
              <header className="mb-3 flex items-baseline justify-between px-1.5">
                <h3 className="text-sm font-semibold">{s.name}</h3>
                <span className="text-xs text-muted">{items.length} · {brl(total)}</span>
              </header>
              <div className="space-y-2.5">
                {items.map((l) => (
                  <article key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                    className="cursor-grab rounded-xl border border-line bg-surface p-3.5 active:cursor-grabbing">
                    <Link href={`/crm/${l.id}`} className="text-sm font-medium hover:underline">{l.name}</Link>{l.diag && <DiagTag />}
                    {l.company && <div className="text-xs text-muted">{l.company}</div>}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-medium">{brl(Number(l.potential_value))}</span>
                      <span className="text-muted">{l.owner ?? 'Sem resp.'}</span>
                    </div>
                    {l.stale && s.kind === 'open' && <div className="mt-2 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] text-warn">Sem contato há {l.daysSinceContact} dias</div>}
                    <label className="sr-only" htmlFor={`mv-${l.id}`}>Mover {l.name}</label>
                    <select id={`mv-${l.id}`} value={l.stage_id} onChange={(e) => move(l.id, stages.find((x) => x.id === e.target.value)!)} className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs">
                      {stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </article>
                ))}
                {!items.length && <p className="px-1.5 py-6 text-center text-xs text-muted">Arraste um lead para cá</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
