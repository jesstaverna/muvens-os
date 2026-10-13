import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TEMPLATES } from '@/lib/proposal-templates';
import { createProposal } from '../actions';

export const metadata = { title: 'Nova proposta' };

export default async function NovaProposta({ searchParams }: { searchParams: Promise<{ lead?: string; servico?: string }> }) {
  const { supabase, profile } = await requireModule('propostas');
  if (profile.role === 'financeiro') return <p className="text-sm text-muted">Seu perfil pode consultar propostas, mas não criá-las.</p>;
  const { lead, servico } = await searchParams;
  const [{ data: leads }, { data: clients }] = await Promise.all([
    supabase.from('leads').select('id, name, company, segment, service_interest, notes').order('created_at', { ascending: false }).limit(300),
    supabase.from('clients').select('id, name').order('name').limit(300),
  ]);
  const sel = leads?.find((l) => l.id === lead);
  const prefill = sel ? [sel.company || sel.name, sel.segment && `Segmento: ${sel.segment}`].filter(Boolean).join(' — ') : '';
  return (
    <>
      <PageHeader title="Nova proposta" subtitle="1) escolha o serviço · 2) cliente · 3) briefing. A página da proposta é montada com o que você informar; valores e prazos são sempre definidos por você." />
      <form action={createProposal} className="card max-w-3xl space-y-6">
        <h2 className="text-base font-semibold">1. Serviço</h2>
        <Field label="Serviço (modelo da proposta)"><select name="template" defaultValue={TEMPLATES.some((t) => t.key === servico) ? servico : undefined} className="input">{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        <h2 className="border-t border-line pt-6 text-base font-semibold">2. Cliente</h2>
        <Field label="Lead do CRM" hint="Ao aceitar a proposta, o lead é movido para Fechado e vira cliente."><select name="lead_id" defaultValue={lead ?? ''} className="input"><option value="">— sem lead —</option>{leads?.map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` · ${l.company}` : ''}</option>)}</select></Field>
        <Field label="Ou cliente existente"><select name="client_id" className="input"><option value="">— nenhum —</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Nome exibido na proposta" hint="Opcional se houver lead/cliente."><input name="client_name" className="input" /></Field>
        <h2 className="border-t border-line pt-6 text-base font-semibold">3. Briefing da proposta</h2>
        <Field label="Sobre o cliente" hint="Quem é, o que faz, momento do negócio. Aparece na página da proposta."><textarea name="sobre_cliente" rows={4} defaultValue={prefill} className="input" /></Field>
        <Field label="O que o cliente espera"><textarea name="expectativas" rows={3} defaultValue={sel?.notes ?? ''} className="input" /></Field>
        <Field label="Resultados que vamos entregar (um por linha)" hint="Seja específico e só prometa o que a Muvens pode cumprir."><textarea name="resultados" rows={4} className="input" /></Field>
        <SubmitButton pendingText="Gerando…">Gerar proposta</SubmitButton>
      </form>
    </>
  );
}
