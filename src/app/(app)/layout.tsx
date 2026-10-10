import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { MODULES, ROLE_LABEL } from '@/lib/permissions';
import { Sidebar } from '@/components/Sidebar';
import { Flash } from '@/components/Flash';
import { ThemeToggle } from '@/components/ThemeToggle';

async function signOut() { 'use server'; const s = await createClient(); await s.auth.signOut(); redirect('/login'); }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.profile.active || s.profile.role === 'cliente') redirect('/sem-acesso');

  const items = MODULES.filter((m) => m.roles.includes(s.profile.role)).map(({ key, label, href, icon, phase }) => ({ key, label, href, icon, phase }));
  const supabase = await createClient();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);

  return (
    <div className="min-h-screen">
      <Suspense><Flash /></Suspense>
      <Sidebar items={items} userName={s.profile.full_name || s.profile.email || 'Usuário'} roleLabel={ROLE_LABEL[s.profile.role]} signOut={signOut} />
      <div className="lg:pl-64">
        <div className="flex items-center justify-end gap-2 px-6 pt-5 max-lg:hidden lg:px-10">
          <Link href="/alertas" className="btn btn-sm relative" aria-label={`Alertas${count ? `: ${count} não lidos` : ''}`}>
            <Bell className="h-4 w-4" strokeWidth={1.6} />
            {!!count && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-[10px] font-bold text-black">{count > 99 ? '99+' : count}</span>}
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-20 sm:px-6 lg:px-10 lg:pt-6">
          <div className="mb-4 flex justify-end gap-2 lg:hidden"><Link href="/alertas" className="btn btn-sm">Alertas{count ? ` (${count})` : ''}</Link><ThemeToggle /></div>
          {children}
        </main>
      </div>
    </div>
  );
}
