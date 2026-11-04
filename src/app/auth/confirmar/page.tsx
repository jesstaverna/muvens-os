import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Flash } from '@/components/Flash';
import { SubmitButton } from '@/components/SubmitButton';
import { flash } from '@/lib/session';

export const metadata = { title: 'Acessar o portal' };
const TYPES = ['invite', 'recovery'] as const;
const HASH = /^[A-Za-z0-9_-]{16,128}$/;

// O link só é consumido ao CLICAR no botão (POST): prévias de WhatsApp/e-mail que apenas abrem o endereço não gastam o link.
async function confirmar(fd: FormData) {
  'use server';
  const token_hash = String(fd.get('token_hash') ?? ''); const type = String(fd.get('type') ?? '') as (typeof TYPES)[number];
  const back = `/auth/confirmar?token_hash=${encodeURIComponent(token_hash)}&type=${type}`;
  if (!HASH.test(token_hash) || !TYPES.includes(type)) flash('/login', 'err', 'Link inválido. Peça um novo link à Muvens.');
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) flash(back, 'err', 'Este link expirou ou já foi usado. Peça um novo link à Muvens.');
  redirect('/definir-senha');
}

export default async function Confirmar({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const sp = await searchParams;
  const valid = HASH.test(sp.token_hash ?? '') && (TYPES as readonly string[]).includes(sp.type ?? '');
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Suspense><Flash /></Suspense>
      <div className="w-full max-w-sm space-y-6 text-center">
        <img src="/logo-muvens.svg" alt="Muvens" className="mx-auto h-10 w-auto" />
        {valid ? (
          <form action={confirmar} className="space-y-5"><input type="hidden" name="token_hash" value={sp.token_hash} /><input type="hidden" name="type" value={sp.type} />
            <div><h1 className="h1">Bem-vindo ao Portal do Cliente</h1><p className="mt-2 text-sm text-muted">Acompanhe suas demandas, prazos e aprovações com a equipe Muvens. Clique para entrar e criar a sua senha.</p></div>
            <SubmitButton className="btn btn-primary w-full" pendingText="Entrando…">Entrar</SubmitButton></form>
        ) : <div><h1 className="h1">Link inválido</h1><p className="mt-2 text-sm text-muted">Este link está incompleto ou expirou. Peça um novo link à Muvens.</p><a href="/login" className="btn mt-5 inline-flex">Ir para o login</a></div>}
      </div>
    </main>
  );
}
