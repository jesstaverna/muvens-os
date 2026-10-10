import { requireModule } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { LeadForm } from '../LeadForm';
import { createLead } from '../actions';

export const metadata = { title: 'Novo lead' };

export default async function NovoLead() {
  const { supabase, profile } = await requireModule('crm');
  const [{ data: stages }, { data: owners }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name').eq('active', true).order('position'),
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial']).eq('active', true).order('full_name'),
  ]);
  return (
    <>
      <PageHeader title="Novo lead" subtitle="O sistema impede e-mails e telefones duplicados." />
      <div className="card max-w-4xl"><LeadForm action={createLead} stages={stages ?? []} owners={owners ?? []} lead={{ owner_id: profile.id }} submitLabel="Criar lead" /></div>
    </>
  );
}
