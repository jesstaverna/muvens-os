import { requireModule } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { ClientForm } from '../ClientForm';
import { saveClient } from '../actions';

export const metadata = { title: 'Novo cliente' };
export default async function NovoCliente() {
  await requireModule('clientes');
  return (<><PageHeader title="Novo cliente" /><div className="card max-w-4xl"><ClientForm action={saveClient.bind(null, null)} /></div></>);
}
