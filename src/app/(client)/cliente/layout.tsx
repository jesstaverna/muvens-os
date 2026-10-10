import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Flash } from '@/components/Flash';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ClientNav } from './ClientNav';

async function signOut() { 'use server'; const s = await createClient(); await s.auth.signOut(); redirect('/login'); }

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requirePortal();
  const { data: o } = await supabase.rpc('portal_overview');
  const ov = (o ?? {}) as { client_name?: string; awaiting_approval?: number };
  return (
    <div className="min-h-screen">
      <Suspense><Flash /></Suspense>
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-fg text-sm font-bold text-lime">M</span><div className="leading-tight"><div className="text-sm font-semibold">Portal do Cliente</div><div className="text-[11px] text-muted">{ov.client_name} · Muvens Agência</div></div></div>
        <div className="flex items-center gap-2"><span className="hidden text-xs text-muted sm:inline">{profile.full_name || profile.email}</span><ThemeToggle /><form action={signOut}><button className="btn btn-sm">Sair</button></form></div>
      </header>
      <ClientNav pending={ov.awaiting_approval ?? 0} />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-8">{children}</main>
    </div>
  );
}
