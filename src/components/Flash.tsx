'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Feedback de ações: lê ?ok= / ?err= (definidos pelas Server Actions), mostra e limpa a URL. */
export function Flash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const ok = params.get('ok'), err = params.get('err');
    if (!ok && !err) return;
    setMsg({ kind: err ? 'err' : 'ok', text: (err ?? ok)! });
    const next = new URLSearchParams(params.toString());
    next.delete('ok'); next.delete('err');
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [params, pathname, router]);

  if (!msg) return null;
  return (
    <div role={msg.kind === 'err' ? 'alert' : 'status'}
      className={`fixed right-4 top-4 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${msg.kind === 'err' ? 'border-danger/40 bg-surface text-danger' : 'border-line bg-fg text-bg'}`}>
      {msg.text}
      <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMsg(null)} aria-label="Fechar">×</button>
    </div>
  );
}
