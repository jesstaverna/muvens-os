'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { analyzeBatch } from './actions';

/** Analisa automaticamente, em sequência, os prospectos do grupo ainda não analisados (enquanto a página estiver aberta). */
export function AutoAnalyze({ grp, pending }: { grp: string; pending: number }) {
  const router = useRouter();
  const running = useRef(false);
  const [total, setTotal] = useState(0);
  const [left, setLeft] = useState(0);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (pending <= 0 || running.current) return;       // durante a execução, o refresh muda `pending`; só um laço roda por vez
    running.current = true; setTotal(pending); setLeft(pending); setState('running'); setErr(null);
    let alive = true;
    (async () => {
      let remaining = pending, guard = 0;
      while (alive && remaining > 0 && guard++ < 100) {
        const r = await analyzeBatch(grp);
        if (r.error) { setErr(r.error); setState('error'); running.current = false; return; }
        remaining = r.remaining; setLeft(remaining); router.refresh();
        if (r.processed === 0) break;
      }
      running.current = false;
      if (alive) { setState('done'); router.refresh(); }
    })();
    return () => { alive = false; running.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grp, pending > 0]);

  if (state === 'idle') return null;
  const done = Math.max(total - left, 0);
  return (
    <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-subtle px-4 py-3 text-sm">
      {state === 'running' && <><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span>Analisando automaticamente… <b>{done}</b> de <b>{total}</b>. Pode continuar nesta página; a lista atualiza sozinha.</span></>}
      {state === 'done' && <><CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /><span>Análise concluída: {total} prospecto(s) analisado(s).</span></>}
      {state === 'error' && <span className="text-danger">A análise automática parou: {err}. Recarregue a página para tentar de novo.</span>}
    </div>
  );
}
