'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GROUP_ICONS, GROUP_ORDER } from '@/lib/permissions';
import { Icon } from './Icon';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  phase: number;
  group: string;
}

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
  const groupsKey = 'muvens-nav-groups:' + userId;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(groupsKey) ?? localStorage.getItem('muvens-nav') ?? '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) setClosedGroups(stored);
    } catch { /* O menu funciona sem armazenamento local. */ }
  }, [groupsKey]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(favoritesKey) ?? '[]');
      setFavorites(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []);
    } catch { setFavorites([]); }
  }, [favoritesKey]);

  const toggleGroup = (group: string) => setClosedGroups((current) => {
    const next = { ...current, [group]: !current[group] };
    try { localStorage.setItem(groupsKey, JSON.stringify(next)); } catch { /* ignora */ }
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

  // Links com filtros de visualização representam páginas distintas no menu.
  const isActive = (item: NavItem) => {
    const [path, params] = item.href.split('?');
    if (pathname !== path && !pathname.startsWith(path + '/')) return false;
    if (params) {
      if (pathname !== path) return false;
      return [...new URLSearchParams(params).entries()].every(([key, value]) => query.get(key) === value);
    }
    if (pathname === path) {
      const specificViewIsActive = items.some(
        (other) => other.href.startsWith(path + '?') && isViewMatch(other.href, query)
      );
      if (specificViewIsActive) return false;
    }
    return true;
  };

  const navItem = (item: NavItem, prefix: string, compact = false) => {
    const active = isActive(item);
    const pinned = favorites.includes(item.key);
    return (
      <div key={prefix + item.key} className={
        'group relative flex min-h-[38px] items-center rounded-[11px] transition-colors ' +
        (active ? 'bg-lime text-black' : 'text-fg/75 hover:bg-subtle hover:text-fg')
      }>
        <Link
          href={item.href}
          onClick={() => setMobileOpen(false)}
          title={compact ? item.label : undefined}
          aria-label={compact ? item.label : undefined}
          aria-current={active ? 'page' : undefined}
          className={
            'flex min-w-0 flex-1 items-center gap-3 rounded-[11px] text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg ' +
            (compact ? 'justify-center px-2 py-2.5' : 'py-2.5 pl-3 pr-1') +
            (active ? ' font-semibold' : ' font-medium')
          }
        >
          <Icon name={item.icon} className="h-[17px] w-[17px] shrink-0" />
          {!compact && (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.phase > 1 && (
                <span className="rounded-md border border-current/30 px-1.5 py-0.5 text-[10px] font-medium opacity-65">
                  F{item.phase}
                </span>
              )}
            </>
          )}
        </Link>
        {!compact && (
          <button
            type="button"
            onClick={() => toggleFavorite(item.key)}
            title={pinned ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            aria-label={(pinned ? 'Remover ' : 'Favoritar ') + item.label}
            aria-pressed={pinned}
            className={
              'mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md transition-opacity focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current ' +
              (pinned
                ? 'opacity-70 hover:opacity-100'
                : 'opacity-45 hover:opacity-100 md:opacity-0 md:group-hover:opacity-70 md:group-focus-within:opacity-100')
            }
          >
            <Star className="h-[15px] w-[15px]" fill={pinned ? 'currentColor' : 'none'} strokeWidth={1.6} />
          </button>
        )}
      </div>
    );
  };

  const navigation = (compact: boolean) => (
    <nav
      aria-label="Menu principal"
      className={
        'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pt-3 ' +
        (compact ? 'space-y-2 px-2' : 'px-3')
      }
    >
      {favoriteItems.length > 0 && (
        <section aria-label="Páginas favoritas" className={
          'border-b border-line/80 ' + (compact ? 'mb-3 space-y-1 pb-3' : 'mb-3 pb-4')
        }>
          {!compact && (
            <div className="mb-2 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">
              <Star className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>Acesso rápido</span>
              <span className="ml-auto font-normal tracking-normal">{favoriteItems.length}</span>
            </div>
          )}
          <div className="space-y-1">
            {favoriteItems.map((item) => navItem(item, 'favorite-', compact))}
          </div>
        </section>
      )}
      {groups.map(({ group, list }, index) => {
        // Evita duplicidade: páginas fixadas ficam somente em Acesso rápido.
        const visibleItems = list.filter((item) => !favorites.includes(item.key));
        const activeGroup = list.some(isActive);
        const expanded = visibleItems.some(isActive) || !closedGroups[group];
        if (compact) {
          const current = list.find(isActive) ?? list[0];
          return (
            <Link
              key={group}
              href={current.href}
              title={group}
              aria-label={group}
              onClick={() => setMobileOpen(false)}
              className={
                'flex min-h-10 items-center justify-center rounded-[11px] p-2.5 transition-colors ' +
                (activeGroup ? 'bg-lime text-black' : 'text-fg/70 hover:bg-subtle hover:text-fg')
              }
            >
              <Icon name={GROUP_ICONS[group]} className="h-[18px] w-[18px]" />
            </Link>
          );
        }
        return (
          <section
            key={group}
            aria-label={group}
            className={
              'border-t border-line/70 pt-3 ' +
              (index === 0 ? 'mt-0' : 'mt-3')
            }
          >
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              aria-expanded={expanded}
              className={
                'group relative flex w-full items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg ' +
                (activeGroup
                  ? 'bg-subtle/70 text-fg'
                  : 'text-muted hover:bg-subtle/70 hover:text-fg')
              }
            >
              <span aria-hidden="true" className={
                'absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full ' +
                (activeGroup ? 'bg-lime' : 'bg-transparent')
              } />
              <Icon name={GROUP_ICONS[group]} className="h-[15px] w-[15px] shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em]">{group}</span>
              <ChevronDown
                className={'h-3.5 w-3.5 shrink-0 transition-transform ' + (expanded ? '' : '-rotate-90')}
                strokeWidth={1.6}
              />
            </button>
            {expanded && (
              <div className="mt-1 space-y-0.5 pl-2">
                {visibleItems.length > 0
                  ? visibleItems.map((item) => navItem(item, group + '-'))
                  : <p className="px-3 py-2 text-[11px] text-muted">Itens em Acesso rápido</p>}
              </div>
            )}
          </section>
        );
      })}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className={
      'shrink-0 border-b border-line/80 ' +
      (compact ? 'px-2 pb-4 pt-5' : 'px-5 pb-5 pt-6')
    }>
      <div className={'flex items-center gap-3 ' + (compact ? 'justify-center' : '')}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black p-1.5">
          <img src="/logo-muvens.svg" alt="Muvens" className="h-full w-full object-contain" />
        </span>
        {!compact && (
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-bold tracking-[0.025em]">MUVENS OS</div>
            <div className="mt-1 text-[11px] text-muted">Painel de gestão</div>
          </div>
        )}
      </div>
    </div>
  );

  const footer = (compact: boolean) => (
    <div className={'shrink-0 border-t border-line/80 ' + (compact ? 'p-2' : 'px-4 py-4')}>
      {!compact && (
        <div className="mb-4 border-b border-line/60 px-1 pb-3">
          <div className="truncate text-[13px] font-semibold">{userName}</div>
          <div className="mt-0.5 text-[11px] text-muted">{roleLabel}</div>
        </div>
      )}
      <form action={signOut}>
        <button className={'btn btn-sm w-full gap-2 ' + (compact ? '!px-0' : '')} title="Sair" aria-label="Sair">
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
          {!compact && 'Sair'}
        </button>
      </form>
      <button
        type="button"
        onClick={onToggle}
        className={'btn btn-sm mt-2 hidden w-full gap-2 lg:flex ' + (compact ? '!px-0' : '')}
        aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
      >
        {compact
          ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.7} />
          : <><PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />Recolher menu</>}
      </button>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="text-sm font-semibold tracking-wide">MUVENS OS</span>
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="btn btn-sm">
          <Menu className="h-4 w-4" />
        </button>
      </div>
      <aside className={
        'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-line bg-surface transition-[width] lg:flex ' +
        (collapsed ? 'w-[68px]' : 'w-[280px]')
      }>
        {brand(collapsed)}
        {navigation(collapsed)}
        {footer(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="Menu de navegação">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="btn btn-sm absolute right-3 top-3"
            >
              <X className="h-4 w-4" />
            </button>
            {brand(false)}
            {navigation(false)}
            {footer(false)}
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
