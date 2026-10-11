'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { globalSearch, type SearchHit } from '@/app/(app)/search-actions';
import type { NavItem } from './Sidebar';
import { Icon } from './Icon';

export function GlobalSearch({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) { setQ(''); setHits([]); setSel(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);

  const modules = q.trim().length >= 1 ? items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4) : items.slice(0, 6);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = ++seq.current; setBusy(true);
    const t = setTimeout(async () => { const r = await globalSearch(q); if (id === seq.current) { setHits(r); setBusy(false); setSel(0); } }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const rows: { key: string; label: string; sub?: string; type: string; href: string; icon?: string }[] = [
    ...modules.map((m) => ({ key: `m-${m.key}`, label: m.label, type: 'Ir para', href: m.href, icon: m.icon })),
    ...hits.map((h, i) => ({ key: `h-${i}`, label: h.label, sub: h.sub, type: h.type, href: h.href })),
  ];
  const go = (href: string) => { setOpen(false); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && rows[sel]) go(rows[sel].href);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-sm gap-2 text-muted" aria-label="Buscar (Ctrl+K)">
        <Search className="h-4 w-4" strokeWidth={1.7} /><span className="hidden sm:inline">Buscar…</span><kbd className="hidden rounded border border-line px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-start px-4 pt-[12vh]" role="dialog" aria-modal aria-label="Busca global">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-line px-4"><Search className="h-4 w-4 text-muted" strokeWidth={1.7} />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Buscar clientes, leads, propostas, tarefas, prospectos…" className="w-full bg-transparent py-4 text-sm outline-none" aria-label="Buscar" /></div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {rows.map((r, i) => (
                <li key={r.key}><button type="button" onClick={() => go(r.href)} onMouseEnter={() => setSel(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${i === sel ? 'bg-subtle' : ''}`}>
                  {r.icon ? <Icon name={r.icon} /> : <span className="grid h-[18px] w-[18px] place-items-center text-[10px] font-semibold text-muted">{r.type[0]}</span>}
                  <span className="flex-1 truncate">{r.label}{r.sub && <span className="ml-2 text-xs text-muted">{r.sub}</span>}</span><span className="text-[11px] text-muted">{r.type}</span></button></li>))}
              {busy && <li className="px-3 py-2 text-xs text-muted">Buscando…</li>}
              {!busy && q.trim().length >= 2 && !hits.length && <li className="px-3 py-2 text-xs text-muted">Nenhum cliente, lead, proposta, tarefa ou prospecto encontrado.</li>}
            </ul>
          </div>
        </div>)}
    </>
  );
}
