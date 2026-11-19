import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Solicitar demanda | Muvens' };

/** URL curta para a agência compartilhar com cada cliente. Não expõe dados sem autenticação. */
export default async function AcessoSolicitacoes() {
  const session = await getSession();
  if (!session) redirect('/login?next=%2Fcliente%2Fsolicitar');
  if (!session.profile.active) redirect('/sem-acesso');
  if (session.profile.role === 'cliente' && session.profile.client_id) redirect('/cliente/solicitar');
  redirect('/dashboard');
}
