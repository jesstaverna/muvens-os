import { Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';

export interface LeadFormProps {
  action: (fd: FormData) => Promise<void>;
  stages: { id: string; name: string }[];
  owners: { id: string; full_name: string }[];
  lead?: Record<string, string | number | null>;
  submitLabel: string;
}

const toLocal = (iso?: string | number | null) => (iso ? new Date(String(iso)).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16) : '');
const v = (x: unknown) => (x == null ? '' : String(x));

export function LeadForm({ action, stages, owners, lead, submitLabel }: LeadFormProps) {
  return (
    <form action={action} className="space-y-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome *"><input name="name" required minLength={2} defaultValue={v(lead?.name)} className="input" /></Field>
        <Field label="Empresa"><input name="company" defaultValue={v(lead?.company)} className="input" /></Field>
        <Field label="WhatsApp"><input name="whatsapp" inputMode="tel" defaultValue={v(lead?.whatsapp)} className="input" placeholder="(11) 90000-0000" /></Field>
        <Field label="Telefone"><input name="phone" inputMode="tel" defaultValue={v(lead?.phone)} className="input" /></Field>
        <Field label="E-mail" hint="Informe ao menos e-mail, telefone ou WhatsApp. Contatos repetidos são bloqueados."><input name="email" type="email" defaultValue={v(lead?.email)} className="input" /></Field>
        <Field label="Segmento"><input name="segment" defaultValue={v(lead?.segment)} className="input" /></Field>
        <Field label="Origem do lead"><input name="source" list="sources" defaultValue={v(lead?.source)} className="input" />
          <datalist id="sources">{['Indicação', 'Instagram', 'Site / Landing page', 'WhatsApp', 'Google', 'Tráfego pago', 'Evento', 'Outro'].map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="Serviço de interesse"><input name="service_interest" defaultValue={v(lead?.service_interest)} className="input" /></Field>
        <Field label="Investimento estimado do cliente (R$)"><input name="estimated_investment" inputMode="decimal" defaultValue={v(lead?.estimated_investment)} className="input" /></Field>
        <Field label="Valor potencial da negociação (R$)"><input name="potential_value" inputMode="decimal" defaultValue={v(lead?.potential_value ?? 0)} className="input" /></Field>
        <Field label="Etapa do funil *"><select name="stage_id" required defaultValue={v(lead?.stage_id) || stages[0]?.id} className="input">{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Responsável"><select name="owner_id" defaultValue={v(lead?.owner_id)} className="input"><option value="">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</select></Field>
        <Field label="Próxima ação"><input name="next_action" defaultValue={v(lead?.next_action)} className="input" /></Field>
        <Field label="Data da próxima ação"><input name="next_action_at" type="datetime-local" defaultValue={toLocal(lead?.next_action_at)} className="input" /></Field>
      </div>
      <Field label="Anotações"><textarea name="notes" rows={4} defaultValue={v(lead?.notes)} className="input" /></Field>
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
