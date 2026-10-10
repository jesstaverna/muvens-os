'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [['/cliente', 'Início'], ['/cliente/projetos', 'Projetos'], ['/cliente/aprovacoes', 'Aprovações'], ['/cliente/calendario', 'Calendário'], ['/cliente/solicitacoes', 'Solicitações'], ['/cliente/documentos', 'Documentos'], ['/cliente/contratos', 'Propostas e contratos']];

export function ClientNav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Portal" className="flex gap-1 overflow-x-auto border-b border-line px-4 sm:px-8">
      {LINKS.map(([href, label]) => { const active = href === '/cliente' ? path === href : path.startsWith(href); return (
        <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`whitespace-nowrap px-3 py-3 text-sm ${active ? 'border-b-2 border-fg font-medium' : 'text-muted hover:text-fg'}`}>
          {label}{href === '/cliente/aprovacoes' && pending > 0 && <span className="ml-1.5 rounded-full bg-lime px-1.5 text-[10px] font-bold text-black">{pending}</span>}</Link>); })}
    </nav>
  );
}
