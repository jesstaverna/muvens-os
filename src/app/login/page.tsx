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
  if (error) flash('/login', 'err', 'E-mail ou senha inválidos.'); // mensagem genérica: não revela se o e-mail existe
  redirect('/dashboard');
}

export const metadata = { title: 'Entrar' };

export default function LoginPage() {
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
          <div><h1 className="h1">Entrar</h1><p className="mt-1.5 text-sm text-muted">Acesso restrito à equipe Muvens.</p></div>
          <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
          <Field label="Senha"><input name="password" type="password" required autoComplete="current-password" className="input" /></Field>
          <SubmitButton className="btn btn-primary w-full" pendingText="Entrando…">Entrar</SubmitButton>
        </form>
      </section>
    </main>
  );
}
