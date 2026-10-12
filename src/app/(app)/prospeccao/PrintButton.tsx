'use client';
import { Printer } from 'lucide-react';
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs text-white hover:bg-white/10 print:hidden"><Printer className="h-3.5 w-3.5" strokeWidth={1.8} />Imprimir / salvar PDF</button>;
}
