'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar, type NavItem } from './Sidebar';

/** Estrutura do sistema: menu lateral (recolhível, preferência salva) + área de conteúdo. */
export function AppShell({ items, userName, roleLabel, signOut, topBar, children }: { items: NavItem[]; userName: string; roleLabel: string; signOut: () => Promise<void>; topBar: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('muvens-sidebar') === '1'); } catch { /* ignora */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('muvens-sidebar', c ? '0' : '1'); } catch { /* ignora */ } return !c; });
  return (
    <div className="min-h-screen">
      <Sidebar items={items} userName={userName} roleLabel={roleLabel} signOut={signOut} collapsed={collapsed} onToggle={toggle} />
      <div className={`transition-[padding] ${collapsed ? 'lg:pl-[68px]' : 'lg:pl-64'}`}>
        <div className="flex items-center justify-end gap-2 px-4 pt-[4.5rem] sm:px-6 lg:px-10 lg:pt-5">{topBar}</div>
        <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-4 sm:px-6 lg:px-10 lg:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
