import { Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';

const v = (x: unknown) => (x == null ? '' : String(x));
export function ClientForm({ action, client }: { action: (fd: FormData) => Promise<void>; client?: Record<string, unknown> }) {
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome fantasia *"><input name="name" required defaultValue={v(client?.name)} className="input" /></Field>
        <Field label="Razão social"><input name="legal_name" defaultValue={v(client?.legal_name)} className="input" /></Field>
        <Field label="CNPJ / CPF" hint="Único por cliente."><input name="document" defaultValue={v(client?.document)} className="input" /></Field>
        <Field label="Segmento"><input name="segment" defaultValue={v(client?.segment)} className="input" /></Field>
        <Field label="E-mail"><input name="email" type="email" defaultValue={v(client?.email)} className="input" /></Field>
        <Field label="Telefone"><input name="phone" defaultValue={v(client?.phone)} className="input" /></Field>
        <Field label="Site"><input name="website" defaultValue={v(client?.website)} className="input" /></Field>
        <Field label="Situação"><select name="status" defaultValue={v(client?.status) || 'ativo'} className="input"><option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="encerrado">Encerrado</option></select></Field>
      </div>
      <Field label="Endereço"><input name="address" defaultValue={v(client?.address)} className="input" /></Field>
      <Field label="Observações"><textarea name="notes" rows={4} defaultValue={v(client?.notes)} className="input" /></Field>
      <SubmitButton>Salvar cliente</SubmitButton>
    </form>
  );
}
