import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TEMPLATES } from '@/lib/proposal-templates';
import { createProposal } from '../actions';

export const metadata = { title: 'Nova proposta' };

export default async function NovaProposta({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { supabase, profile } = await requireModule('propostas');
  if (profile.role === 'financeiro') return <p className="text-sm text-muted">Seu perfil pode consultar propostas, mas não criá-las.</p>;
  const { lead } = await searchParams;
  const [{ data: leads }, { data: clients }] = await Promise.all([
    supabase.from('leads').select('id, name, company').order('created_at', { ascending: false }).limit(300),
    supabase.from('clients').select('id, name').order('name').limit(300),
  ]);
  return (
    <>
      <PageHeader title="Nova proposta" subtitle="Escolha um modelo. Valores e condições são sempre definidos por você — nada é preenchido automaticamente." />
      <form action={createProposal} className="card max-w-3xl space-y-6">
        <Field label="Modelo"><select name="template" className="input">{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        <Field label="Lead do CRM" hint="Ao aceitar a proposta, o lead é movido para Fechado e vira cliente."><select name="lead_id" defaultValue={lead ?? ''} className="input"><option value="">— sem lead —</option>{leads?.map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` · ${l.company}` : ''}</option>)}</select></Field>
        <Field label="Ou cliente existente"><select name="client_id" className="input"><option value="">— nenhum —</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Nome exibido na proposta" hint="Opcional se houver lead/cliente."><input name="client_name" className="input" /></Field>
        <SubmitButton pendingText="Criando…">Criar rascunho</SubmitButton>
      </form>
    </>
  );
}
