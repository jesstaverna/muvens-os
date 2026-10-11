import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { MODULES, ROLE_LABEL } from '@/lib/permissions';
import { AppShell } from '@/components/AppShell';
import { GlobalSearch } from '@/components/GlobalSearch';
import { Flash } from '@/components/Flash';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LinkButton } from '@/components/LinkButton';

async function signOut() { 'use server'; const s = await createClient(); await s.auth.signOut(); redirect('/login'); }

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.profile.active && s.profile.role === 'cliente' && s.profile.client_id) redirect('/cliente');
  if (!s.profile.active || s.profile.role === 'cliente') redirect('/sem-acesso');

  const items = MODULES.filter((m) => m.roles.includes(s.profile.role)).map(({ key, label, href, icon, phase, done, group }) => ({ key, label, href, icon, group, phase: done ? 1 : phase }));
  const supabase = await createClient();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);

  const bell = (
    <Link href="/alertas" className="btn btn-sm relative" aria-label={`Alertas${count ? `: ${count} não lidos` : ''}`}>
      <Bell className="h-4 w-4" strokeWidth={1.7} />
      {!!count && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-[10px] font-bold text-black">{count > 99 ? '99+' : count}</span>}
    </Link>);

  return (
    <>
      <Suspense><Flash /></Suspense>
      <AppShell items={items} userName={s.profile.full_name || s.profile.email || 'Usuário'} roleLabel={ROLE_LABEL[s.profile.role]} signOut={signOut} topBar={<><GlobalSearch items={items} />{bell}<ThemeToggle /></>}>{children}</AppShell>
    </>
  );
}
