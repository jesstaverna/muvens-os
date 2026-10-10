import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';

async function signOut() { 'use server'; const s = await createClient(); await s.auth.signOut(); redirect('/login'); }

export default async function SemAcesso() {
  const s = await getSession();
  if (!s) redirect('/login');
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="card max-w-md text-center">
        <h1 className="text-xl font-semibold">Acesso ainda não liberado</h1>
        <p className="mt-2 text-sm text-muted">
          {s.profile.role === 'cliente'
            ? 'Sua conta existe, mas ainda não foi liberada por um administrador. O Portal do Cliente chega na Fase 2.'
            : 'Sua conta está desativada. Fale com um administrador.'}
        </p>
        <form action={signOut} className="mt-6"><button className="btn">Sair</button></form>
      </div>
    </main>
  );
}
