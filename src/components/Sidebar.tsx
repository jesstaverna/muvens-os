'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, X, type LucideIcon } from 'lucide-react';
import { GROUP_ORDER } from '@/lib/permissions';
import { Icon } from './Icon';

export interface NavItem { key: string; label: string; href: string; icon: string; phase: number; group: string }
interface Props {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  signOut: () => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
}

const GROUP_LABELS: Record<string,string> = {
  'Visão geral': 'INÍCIO',
  'Comercial': 'COMERCIAL',
  'Clientes e produção': 'OPERAÇÃO',
  'Marketing': 'MARKETING',
  'Finanças': 'FINANCEIRO',
  'Inteligência e sistema': 'SISTEMA',
};
const NAV_STORAGE_KEY = 'muvens-nav-v2';
const dark = {
  bg: 'bg-[#0C0E0D]',
  line: 'border-white/10',
  muted: 'text-white/45',
  regular: 'text-white/65',
};
const getInitials = (fullName: string) => fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p=>p[0]?.toUpperCase()).join('') || 'MU';

export function Sidebar({ items, userName, roleLabel, signOut, collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(NAV_STORAGE_KEY) ?? '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) setClosedGroups(stored);
    } catch { /* armazenamento desabilitado */ }
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [mobileOpen]);

  const toggleGroup = (group:string) => setClosedGroups(current=>{
    const next = { ...current, [group]: !current[group] };
    try { localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ }
    return next;
  });
  const groups = GROUP_ORDER.map(group=>({group,list:items.filter(i=>i.group===group)})).filter(x=>x.list.length>0);
  const isActive = (item: NavItem) => pathname === item.href || pathname.startsWith(item.href + '/');
  const quick = items.find(i=>i.key==='diagnosticos')
    ? {href:'/diagnosticos',label:'Novo diagnóstico'}
    : items.find(i=>i.key==='propostas')
      ? {href:'/propostas/nova',label:'Nova proposta'}
      : items.find(i=>i.key==='projetos')
        ? {href:'/projetos',label:'Ver projetos'}
        : {href:'/dashboard',label:'Ir ao painel'};

  const openSearch = () => {
    setMobileOpen(false);
    window.dispatchEvent(new Event('muvens:open-search'));
  };

  const iconButton = (IconComponent: LucideIcon, text: string, onClick:()=>void) => (
    <button type="button" onClick={onClick} title={text} aria-label={text}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DCEA1E]">
      <IconComponent className="h-[17px] w-[17px]" strokeWidth={1.7}/>
    </button>
  );

  const header = (compact:boolean) => (
    <header className={compact ? 'px-3 pb-5 pt-6' : 'px-5 pb-5 pt-6'}>
      <Link href="/dashboard" onClick={()=>setMobileOpen(false)} title="Ir ao Dashboard"
        className={'flex items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#DCEA1E] ' + (compact ? 'justify-center' : 'gap-3')}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#DCEA1E]/25 bg-[#1B2018]">
          <img src="/logo-muvens.svg" alt="Muvens" className="h-7 w-7 object-contain"/>
        </span>
        {!compact && <span className="min-w-0">
          <span className="block text-[13px] font-bold tracking-[.14em] text-white">MUVENS OS</span>
          <span className="mt-0.5 block text-[11px] text-white/45">Central da agência</span>
        </span>}
      </Link>

      <div className={compact ? 'mt-6 space-y-2' : 'mt-6 space-y-3'}>
        <button type="button" onClick={openSearch} title="Buscar em todo o sistema (Ctrl+K)"
          className={'flex h-10 w-full items-center rounded-xl border border-white/10 bg-white/[.055] text-white/60 transition hover:border-white/20 hover:bg-white/[.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DCEA1E] ' + (compact ? 'justify-center' : 'gap-2.5 px-3')}>
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.7}/>
          {!compact && <><span className="flex-1 text-left text-xs">Buscar no sistema</span><kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/40">⌘K</kbd></>}
        </button>
        <Link href={quick.href} onClick={()=>setMobileOpen(false)} title={quick.label}
          className={'flex h-10 items-center justify-center rounded-xl bg-[#DCEA1E] text-xs font-semibold text-[#0A0A0A] transition hover:bg-[#C9D71B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DCEA1E] ' + (compact ? '' : 'gap-2')}>
          <Plus className="h-4 w-4" strokeWidth={2.2}/>{!compact && quick.label}
        </Link>
      </div>
    </header>
  );

  const navigation = (compact:boolean) => (
    <nav aria-label="Menu principal" className={'min-h-0 flex-1 overflow-y-auto pb-5 [scrollbar-width:thin] [scrollbar-color:#343831_transparent] ' + (compact ? 'space-y-3 px-2.5' : 'space-y-4 px-3')}>
      {groups.map(({group,list})=>{
        const isStart = group==='Visão geral';
        const expanded = compact || isStart || list.some(isActive) || !closedGroups[group];
        return <section key={group} aria-label={group} className={compact ? 'border-b border-white/[.085] pb-3 last:border-0' : ''}>
          {!compact && (isStart
            ? <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.19em] text-white/35">{GROUP_LABELS[group] ?? group}</div>
            : <button type="button" onClick={()=>toggleGroup(group)} aria-expanded={expanded}
                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-left text-[10px] font-bold uppercase tracking-[.18em] text-white/35 transition hover:text-white/75">
                {GROUP_LABELS[group] ?? group}
                <ChevronDown className={'h-3.5 w-3.5 transition-transform duration-150 ' + (expanded ? '' : '-rotate-90')}/>
              </button>)}
          {expanded && <div className="space-y-[3px]">{list.map(item=>{
            const active = isActive(item);
            return <Link key={item.key} href={item.href} onClick={()=>setMobileOpen(false)}
                aria-current={active ? 'page' : undefined}
                aria-label={compact ? item.label : undefined}
                title={compact ? item.label : undefined}
                className={'group relative flex items-center rounded-[10px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#DCEA1E] ' +
                  (compact ? 'h-11 justify-center' : 'min-h-10 gap-3 px-3 py-2.5') + ' ' +
                  (active ? 'bg-[#DCEA1E]/[.12] text-[#E8FF9A]' : 'text-white/65 hover:bg-white/[.075] hover:text-white')}>
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[#DCEA1E]"/>}
                <Icon name={item.icon} className={'h-[18px] w-[18px] shrink-0 ' + (active ? 'text-[#DCEA1E]' : 'text-white/45 group-hover:text-white/75')}/>
                {!compact && <><span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                  {item.phase > 1 && <span className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] text-white/35">EM BREVE</span>}
                  {active && item.phase===1 && <ChevronRight className="h-3.5 w-3.5 text-[#DCEA1E]/65"/>}
                </>}
              </Link>;
          })}</div>}
        </section>;
      })}
    </nav>
  );

  const footer = (compact:boolean) => (
    <footer className={'border-t border-white/10 ' + (compact ? 'px-2.5 py-4' : 'px-4 py-4')}>
      <div className={'flex items-center ' + (compact ? 'justify-center' : 'gap-3 px-1')}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#DCEA1E]/30 bg-[#DCEA1E]/10 text-[11px] font-bold text-[#DCEA1E]" title={userName}>
          {getInitials(userName)}
        </div>
        {!compact && <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{userName}</div>
          <div className="truncate text-[11px] text-white/40">{roleLabel}</div>
        </div>}
        {!compact && <form action={signOut}><button type="submit" aria-label="Sair" title="Sair da conta" className="grid h-9 w-9 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" strokeWidth={1.7}/></button></form>}
      </div>
      {compact && <form action={signOut} className="mt-2 flex justify-center"><button aria-label="Sair" title="Sair da conta" className="grid h-9 w-9 place-items-center rounded-lg text-white/45 hover:bg-white/10"><LogOut className="h-4 w-4" strokeWidth={1.7}/></button></form>}
      <div className="mt-4 hidden justify-center border-t border-white/10 pt-3 lg:flex">
        <button type="button" onClick={onToggle} aria-label={compact ? 'Expandir menu' : 'Recolher menu'} title={compact ? 'Expandir menu' : 'Recolher menu'}
          className={'flex h-9 items-center justify-center gap-2 rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white ' + (compact ? 'w-9' : 'w-full')}>
          {compact ? <PanelLeftOpen className="h-[17px] w-[17px]"/> : <><PanelLeftClose className="h-[17px] w-[17px]"/><span className="text-xs">Recolher menu</span></>}
        </button>
      </div>
    </footer>
  );

  const shell = (compact:boolean) => (
    <div className="flex h-full flex-col">{header(compact)}{navigation(compact)}{footer(compact)}</div>
  );
  return <>
    <div className={'fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 px-4 text-white backdrop-blur lg:hidden ' + dark.bg}>
      <div className="flex items-center gap-2"><img src="/logo-muvens.svg" alt="" className="h-6 w-6"/><span className="text-xs font-bold tracking-[.13em]">MUVENS OS</span></div>
      {iconButton(Menu,'Abrir menu',()=>setMobileOpen(true))}
    </div>
    <aside className={'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-white/10 transition-[width] duration-200 lg:flex ' + dark.bg + ' ' + (collapsed ? 'w-[76px]' : 'w-[278px]')}>
      {shell(collapsed)}
    </aside>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Menu principal" aria-modal="true">
      <button type="button" className="absolute inset-0 w-full bg-black/70" onClick={()=>setMobileOpen(false)} aria-label="Fechar menu"/>
      <aside className={'absolute inset-y-0 left-0 w-[min(85vw,310px)] border-r border-white/10 shadow-2xl ' + dark.bg}>
        <button type="button" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)} className="absolute right-3 top-7 z-10 grid h-9 w-9 place-items-center rounded-lg text-white/65 hover:bg-white/10"><X className="h-5 w-5"/></button>
        {shell(false)}
      </aside>
    </div>}
  </>;
}
