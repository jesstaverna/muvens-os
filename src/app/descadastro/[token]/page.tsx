import { createAnonClient } from '@/lib/supabase/anon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Descadastro', robots: { index: false, follow: false } };

/** Descadastro de 1 clique (link do e-mail). Resposta sempre genérica para não revelar quais tokens existem. */
export default async function Descadastro({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (/^[a-f0-9]{64}$/.test(token)) await createAnonClient().rpc('unsubscribe_prospect', { p_token: token });
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-center">
      <div className="card max-w-md"><h1 className="text-xl font-semibold">Pronto, você não receberá mais mensagens</h1><p className="mt-2 text-sm text-muted">Registramos o seu pedido. Se foi engano ou se quiser falar conosco, responda ao nosso e-mail.</p></div>
    </main>
  );
}
