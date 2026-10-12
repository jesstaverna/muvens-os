'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GROUP_ORDER } from '@/lib/permissions';
import { Icon } from './Icon';

export interface NavItem { key: string; label: string; href: string; icon: string; phase: number; group: string }

interface Props { items: NavItem[]; userName: string; roleLabel: string; signOut: () => Promise<void>; collapsed: boolean; onToggle: () => void }

export function Sidebar({ items, userName, roleLabel, signOut, collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setClosedGroups(JSON.parse(localStorage.getItem('muvens-nav') ?? '{}')); } catch { /* sem armazenamento */ } }, []);
  const toggleGroup = (g: string) => setClosedGroups((c) => { const n = { ...c, [g]: !c[g] }; try { localStorage.setItem('muvens-nav', JSON.stringify(n)); } catch { /* ignora */ } return n; });
  const groups = GROUP_ORDER.map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter((x) => x.list.length);
  const isActive = (m: NavItem) => pathname === m.href || pathname.startsWith(m.href + '/');

  /** compact = barra recolhida (só ícones) no desktop. */
  const nav = (compact: boolean) => (
    <nav aria-label="Menu principal" className={`flex-1 overflow-y-auto py-2 ${compact ? 'space-y-1 px-2' : 'space-y-3 px-3'}`}>
      {groups.map(({ g, list }) => {
        const single = list.length === 1 && g === 'Visão geral';
        const isOpen = compact || single || list.some(isActive) || !closedGroups[g];
        return (
          <div key={g} className={compact ? 'border-b border-line/60 pb-1 last:border-0' : ''}>
            {!compact && !single && <button type="button" onClick={() => toggleGroup(g)} aria-expanded={isOpen} className="flex w-full items-center justify-between px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted hover:text-fg">{g}<ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? '' : '-rotate-90'}`} /></button>}
            {isOpen && <div className="space-y-0.5">{list.map((m) => {
              const active = isActive(m);
              return (
                <Link key={m.key} href={m.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} title={compact ? m.label : undefined} aria-label={compact ? m.label : undefined}
                  className={`flex items-center rounded-xl text-sm transition ${compact ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-lime font-medium text-black' : 'text-fg/80 hover:bg-subtle'}`}>
                  <Icon name={m.icon} />{!compact && <><span className="flex-1">{m.label}</span>{m.phase > 1 && <span className="rounded-full border border-current px-1.5 text-[10px] opacity-60">F{m.phase}</span>}</>}
                </Link>);
            })}</div>}
          </div>);
      })}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className={`flex items-center gap-2.5 pb-4 pt-6 ${compact ? 'justify-center px-2' : 'px-6'}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black p-1.5"><img src="/logo-muvens.svg" alt="Muvens" className="h-full w-full object-contain" /></span>
      {!compact && <div className="leading-tight"><div className="text-sm font-semibold tracking-wide">MUVENS OS</div><div className="text-[11px] text-muted">Muvens Agência</div></div>}
    </div>
  );

  const footer = (compact: boolean) => (
    <div className={`border-t border-line ${compact ? 'p-2' : 'p-4'}`}>
      {!compact && <><div className="truncate text-sm font-medium">{userName}</div><div className="mb-3 text-xs text-muted">{roleLabel}</div></>}
      <form action={signOut}><button className={`btn btn-sm w-full gap-2 ${compact ? '!px-0' : ''}`} title="Sair" aria-label="Sair"><LogOut className="h-4 w-4" strokeWidth={1.7} />{!compact && 'Sair'}</button></form>
      <button type="button" onClick={onToggle} className={`btn btn-sm mt-2 hidden w-full gap-2 lg:flex ${compact ? '!px-0' : ''}`} aria-label={compact ? 'Expandir menu' : 'Recolher menu'} title={compact ? 'Expandir menu' : 'Recolher menu'}>
        {compact ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.7} /> : <><PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />Recolher menu</>}</button>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="text-sm font-semibold tracking-wide">MUVENS OS</span>
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="btn btn-sm"><Menu className="h-4 w-4" /></button>
      </div>
      <aside className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-line bg-surface transition-[width] lg:flex ${collapsed ? 'w-[68px]' : 'w-64'}`}>{brand(collapsed)}{nav(collapsed)}{footer(collapsed)}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface">
            <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="btn btn-sm absolute right-3 top-3"><X className="h-4 w-4" /></button>
            {brand(false)}{nav(false)}{footer(false)}
          </aside>
        </div>
      )}
    </>
  );
}
