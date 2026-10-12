'use client';
import { FileDown } from 'lucide-react';

/** Imprime/salva em PDF somente o diagnóstico (a regra de impressão esconde o resto da página). */
export function PrintButton() {
  const go = () => {
    document.body.classList.add('print-diagnostico');
    const done = () => { document.body.classList.remove('print-diagnostico'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
  return <button type="button" onClick={go} className="no-print inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs text-white hover:bg-white/10"><FileDown className="h-3.5 w-3.5" strokeWidth={1.8} />Gerar PDF do diagnóstico</button>;
}
