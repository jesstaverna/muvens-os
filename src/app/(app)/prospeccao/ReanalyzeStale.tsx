'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { reanalyzeBatch } from './actions';

/** Botão "Atualizar análises antigas": refaz, em sequência, as análises do grupo feitas com regras antigas. */
export function ReanalyzeStale({ grp, stale }: { grp: string; stale: number }) {
  const router = useRouter(); const running = useRef(false);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle'); const [left, setLeft] = useState(stale); const [err, setErr] = useState<string | null>(null);
  if (stale <= 0 && state === 'idle') return null;
  const go = async () => {
    if (running.current) return; running.current = true; setState('running'); setErr(null);
    let remaining = stale, guard = 0;
    while (remaining > 0 && guard++ < 200) {
      const r = await reanalyzeBatch(grp);
      if (r.error) { setErr(r.error); setState('error'); running.current = false; return; }
      remaining = r.remaining; setLeft(remaining); router.refresh(); if (r.processed === 0) break;
    }
    running.current = false; setState('done'); router.refresh();
  };
  return (
    <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle px-4 py-3 text-sm">
      {state === 'idle' && <><RefreshCw className="h-4 w-4 shrink-0" /><span><b>{stale}</b> prospecto(s) com análise antiga (sem contatos do site, LinkedIn, decisores e foco de oportunidade).</span><button type="button" onClick={go} className="btn btn-sm btn-primary">Atualizar análises antigas</button></>}
      {state === 'running' && <><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span>Atualizando… faltam <b>{left}</b>. Mantenha esta página aberta.</span></>}
      {state === 'done' && <><CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /><span>Análises atualizadas.</span></>}
      {state === 'error' && <span className="text-danger">Parou: {err}. Recarregue e tente de novo.</span>}
    </div>
  );
}
