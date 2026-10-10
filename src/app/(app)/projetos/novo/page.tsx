import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { createProject } from '../actions';
import { PROJECT_STATUS } from '@/lib/domain';

export const metadata = { title: 'Novo projeto' };
export default async function NovoProjeto() {
  const { supabase, profile } = await requireModule('projetos');
  const [{ data: clients }, { data: people }] = await Promise.all([supabase.from('clients').select('id, name').order('name'), supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name')]);
  return (
    <><PageHeader title="Novo projeto" />
      <form action={createProject} className="card max-w-3xl space-y-5"><div className="grid gap-5 sm:grid-cols-2">
        <Field label="Cliente *"><select name="client_id" required className="input"><option value="">Selecione…</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Nome do projeto *"><input name="name" required className="input" placeholder="Social media — novembro" /></Field>
        <Field label="Situação"><select name="status" defaultValue="em_andamento" className="input">{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Responsável"><select name="owner_id" defaultValue={profile.id} className="input"><option value="">—</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        <Field label="Início"><input type="date" name="starts_on" className="input" /></Field><Field label="Prazo"><input type="date" name="due_on" className="input" /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="client_visible" /> Visível no Portal do Cliente <span className="text-xs text-muted">(o cliente vê o projeto e as tarefas que não forem internas)</span></label>
        <Field label="Observações"><textarea name="notes" rows={3} className="input" /></Field><SubmitButton>Criar projeto</SubmitButton></form></>
  );
}
