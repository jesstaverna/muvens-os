import { requireModule } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { ClientForm } from '../ClientForm';
import { saveClient } from '../actions';

export const metadata = { title: 'Novo cliente' };
export default async function NovoCliente() {
  const { supabase } = await requireModule('clientes');
  const { data: people } = await supabase.from('profiles').select('id, full_name, email').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name');
  return (<><PageHeader title="Novo cliente" /><div className="card max-w-4xl"><ClientForm action={saveClient.bind(null, null)} people={people ?? []} /></div></>);
}
