'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GROUP_ICONS, GROUP_ORDER } from '@/lib/permissions';
import { Icon } from './Icon';

export interface NavItem { key: string; label: string; href: string; icon: string; phase: number; group: string }

interface Props {
  items: NavItem[];
  userName: string;
  userId: string;
  roleLabel: string;
  signOut: () => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ items, userName, userId, roleLabel, signOut, collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const query = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoritesKey = 'muvens-nav-favorites:' + userId;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('muvens-nav') ?? '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) setClosedGroups(stored);
    } catch { /* sem armazenamento */ }
  }, []);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(favoritesKey) ?? '[]');
      setFavorites(Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : []);
    } catch { setFavorites([]); }
  }, [favoritesKey]);

  const toggleGroup = (group: string) => setClosedGroups((current) => {
    const next = { ...current, [group]: !current[group] };
    try { localStorage.setItem('muvens-nav', JSON.stringify(next)); } catch { /* ignora */ }
    return next;
  });

  const toggleFavorite = (key: string) => setFavorites((current) => {
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    try { localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* ignora */ }
    return next;
  });

  const groups = GROUP_ORDER
    .map((group) => ({ group, list: items.filter((item) => item.group === group) }))
    .filter(({ list }) => list.length > 0);
  const favoriteItems = items.filter((item) => favorites.includes(item.key));

  // Links com ?view=... reutilizam a tela existente; só uma entrada fica ativa por vez.
  const isActive = (item: NavItem) => {
    const [path, params] = item.href.split('?');
    if (pathname !== path && !pathname.startsWith(path + '/')) return false;
    if (params) {
      if (pathname !== path) return false;
      return [...new URLSearchParams(params).entries()].every(([key, value]) => query.get(key) === value);
    }
    if (pathname === path) {
      const matchingView = items.some((other) => other.href.startsWith(path + '?') && isViewMatch(other.href, query));
      if (matchingView) return false;
    }
    return true;
  };

  const navItem = (item: NavItem, prefix: string, compact = false) => {
    const active = isActive(item);
    const pinned = favorites.includes(item.key);
    return (
      <div key={prefix + item.key} className={'group flex items-center rounded-xl ' + (active ? 'bg-lime text-black' : 'text-fg/80 hover:bg-subtle')}>
        <Link href={item.href} onClick={() => setMobileOpen(false)}
          title={compact ? item.label : undefined}
          aria-label={compact ? item.label : undefined}
          aria-current={active ? 'page' : undefined}
          className={'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-sm transition ' + (compact ? 'justify-center p-2.5' : 'px-3 py-2.5') + (active ? ' font-medium' : '')}>
          <Icon name={item.icon} />
          {!compact && <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.phase > 1 && <span className="rounded-full border border-current px-1.5 text-[10px] opacity-60">F{item.phase}</span>}
          </>}
        </Link>
        {!compact && (
          <button type="button" onClick={() => toggleFavorite(item.key)}
            title={pinned ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            aria-label={(pinned ? 'Remover ' : 'Favoritar ') + item.label}
            aria-pressed={pinned}
            className={'mr-2 shrink-0 rounded p-1.5 transition hover:opacity-70 focus-visible:outline focus-visible:outline-2 ' + (pinned ? 'opacity-100' : 'opacity-40 group-hover:opacity-100')}>
            <Star className="h-3.5 w-3.5" fill={pinned ? 'currentColor' : 'none'} strokeWidth={1.6} />
          </button>
        )}
      </div>
    );
  };

  const navigation = (compact: boolean) => (
    <nav aria-label="Menu principal" className={'flex-1 overflow-y-auto py-2 ' + (compact ? 'space-y-2 px-2' : 'space-y-3 px-3')}>
      {!compact && favoriteItems.length > 0 && (
        <section aria-label="Páginas favoritas">
          <div className="mb-1 flex items-center gap-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted">
            <Star className="h-3.5 w-3.5" /> Favoritos
          </div>
          <div className="space-y-0.5">{favoriteItems.map((item) => navItem(item, 'fav-'))}</div>
        </section>
      )}
      {groups.map(({ group, list }) => {
        const expanded = list.some(isActive) || !closedGroups[group];
        if (compact) {
          const current = list.find(isActive) ?? list[0];
          return (
            <Link key={group} href={current.href} title={group} aria-label={group}
              className={'flex items-center justify-center rounded-xl p-2.5 ' + (list.some(isActive) ? 'bg-lime text-black' : 'text-fg/80 hover:bg-subtle')}>
              <Icon name={GROUP_ICONS[group]} />
            </Link>
          );
        }
        return (
          <section key={group} aria-label={group}>
            <button type="button" onClick={() => toggleGroup(group)} aria-expanded={expanded}
              className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:bg-subtle hover:text-fg">
              <span className="flex items-center gap-2"><Icon name={GROUP_ICONS[group]} className="h-4 w-4" />{group}</span>
              <ChevronDown className={'h-3.5 w-3.5 transition ' + (expanded ? '' : '-rotate-90')} />
            </button>
            {expanded && <div className="space-y-0.5">{list.map((item) => navItem(item, group + '-'))}</div>}
          </section>
        );
      })}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className={'flex items-center gap-2.5 pb-4 pt-6 ' + (compact ? 'justify-center px-2' : 'px-6')}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black p-1.5">
        <img src="/logo-muvens.svg" alt="Muvens" className="h-full w-full object-contain" />
      </span>
      {!compact && <div className="leading-tight"><div className="text-sm font-semibold tracking-wide">MUVENS OS</div><div className="text-[11px] text-muted">Muvens Agência</div></div>}
    </div>
  );

  const footer = (compact: boolean) => (
    <div className={'border-t border-line ' + (compact ? 'p-2' : 'p-4')}>
      {!compact && <>
        <div className="truncate text-sm font-medium">{userName}</div>
        <div className="mb-3 text-xs text-muted">{roleLabel}</div>
      </>}
      <form action={signOut}>
        <button className={'btn btn-sm w-full gap-2 ' + (compact ? '!px-0' : '')} title="Sair" aria-label="Sair">
          <LogOut className="h-4 w-4" strokeWidth={1.7} />{!compact && 'Sair'}
        </button>
      </form>
      <button type="button" onClick={onToggle}
        className={'btn btn-sm mt-2 hidden w-full gap-2 lg:flex ' + (compact ? '!px-0' : '')}
        aria-label={compact ? 'Expandir menu' : 'Recolher menu'}>
        {compact ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.7} /> : <><PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />Recolher menu</>}
      </button>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="text-sm font-semibold tracking-wide">MUVENS OS</span>
        <button onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="btn btn-sm"><Menu className="h-4 w-4" /></button>
      </div>
      <aside className={'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-line bg-surface transition-[width] lg:flex ' + (collapsed ? 'w-[68px]' : 'w-64')}>
        {brand(collapsed)}{navigation(collapsed)}{footer(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="Menu de navegação">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface">
            <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="btn btn-sm absolute right-3 top-3"><X className="h-4 w-4" /></button>
            {brand(false)}{navigation(false)}{footer(false)}
          </aside>
        </div>
      )}
    </>
  );
}

function isViewMatch(href: string, query: ReturnType<typeof useSearchParams>) {
  const [, params] = href.split('?');
  if (!params) return false;
  return [...new URLSearchParams(params).entries()].every(([key, value]) => query.get(key) === value);
}
