import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Flash } from '@/components/Flash';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { flash } from '@/lib/session';

async function signIn(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: String(formData.get('email') ?? '').trim(), password: String(formData.get('password') ?? '') });
  const wantsRequest = String(formData.get('next') ?? '') === '/cliente/solicitar';
  if (error) flash(wantsRequest ? '/login?next=%2Fcliente%2Fsolicitar' : '/login', 'err', 'E-mail ou senha inválidos.');
  redirect(wantsRequest ? '/cliente/solicitar' : '/dashboard');
}

export const metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const requestEntry = next === '/cliente/solicitar';
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <Suspense><Flash /></Suspense>
      <section className="hidden flex-col justify-between bg-black p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><img src="/logo-muvens.svg" alt="Muvens" className="h-10 w-auto" /><span className="text-lg font-semibold tracking-wide">MUVENS OS</span></div>
        <div><p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Comercial, financeiro e criação em um só lugar.</p><p className="mt-4 text-sm text-white/50">Muvens Agência — operação centralizada.</p></div>
        <span className="h-1.5 w-24 rounded-full bg-lime" />
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <form action={signIn} className="w-full max-w-sm space-y-5">
          {requestEntry && <input type="hidden" name="next" value="/cliente/solicitar" />}
          <div><h1 className="h1">{requestEntry ? 'Acesse para solicitar' : 'Entrar'}</h1><p className="mt-1.5 text-sm text-muted">Acesso à equipe Muvens e aos clientes com convite.</p></div>
          <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
          <Field label="Senha"><input name="password" type="password" required autoComplete="current-password" className="input" /></Field>
          <SubmitButton className="btn btn-primary w-full" pendingText="Entrando…">Entrar</SubmitButton>
        </form>
      </section>
    </main>
  );
}
