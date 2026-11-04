import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Flash } from '@/components/Flash';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { flash } from '@/lib/session';

export const metadata = { title: 'Criar senha' };

async function salvar(fd: FormData) {
  'use server';
  const password = String(fd.get('password') ?? ''); const again = String(fd.get('again') ?? '');
  if (password.length < 8) flash('/definir-senha', 'err', 'A senha precisa ter pelo menos 8 caracteres.');
  if (password !== again) flash('/definir-senha', 'err', 'As senhas não conferem.');
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) flash('/login', 'err', 'Sua sessão expirou. Peça um novo link à Muvens.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) flash('/definir-senha', 'err', 'Não foi possível salvar a senha. Escolha uma senha mais forte e tente de novo.');
  redirect('/dashboard');   // cliente é levado ao Quadro; equipe, ao painel
}

export default async function DefinirSenha() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Suspense><Flash /></Suspense>
      <form action={salvar} className="w-full max-w-sm space-y-5">
        <img src="/logo-muvens.svg" alt="Muvens" className="h-10 w-auto" />
        <div><h1 className="h1">Crie a sua senha</h1><p className="mt-1.5 text-sm text-muted">Você vai usá-la, com o seu e-mail ({data.user.email}), para entrar nas próximas vezes.</p></div>
        <Field label="Nova senha"><input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <Field label="Repita a senha"><input name="again" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Salvando…">Salvar e entrar</SubmitButton>
      </form>
    </main>
  );
}
