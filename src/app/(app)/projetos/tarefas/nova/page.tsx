import { requireModule } from '@/lib/session';
import { personName } from '@/lib/people';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { createTask } from '../../actions';
import { PRIORITY } from '@/lib/domain';
import { AssigneePicker } from '@/components/AssigneePicker';

export const metadata = { title: 'Nova tarefa' };
export default async function NovaTarefa({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { supabase } = await requireModule('projetos');
  const { project } = await searchParams;
  const [{ data: projects }, { data: people }, { data: plans }, { data: services }] = await Promise.all([
    supabase.from('projects').select('id, name, clients(name)').not('status', 'in', '("cancelado","concluido")').order('name'),
    supabase.from('profiles').select('id, full_name, email').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name'),
    supabase.from('deliverable_plans').select('id, name, period_month, project_id, client_id').order('period_month', { ascending: false }).limit(200),
    supabase.rpc('staff_service_options', { p_client: null }),
  ]);
  return (
    <><PageHeader title="Nova tarefa" />
      <form action={createTask} className="card max-w-3xl space-y-5"><div className="grid gap-5 sm:grid-cols-2">
        <Field label="Projeto *"><select name="project_id" required defaultValue={project ?? ''} className="input"><option value="">Selecione…</option>{projects?.map((p: any) => <option key={p.id} value={p.id}>{(Array.isArray(p.clients) ? p.clients[0] : p.clients)?.name} — {p.name}</option>)}</select></Field>
        <Field label="Título *"><input name="title" required className="input" /></Field>
        <div className="sm:col-span-2"><AssigneePicker people={people ?? []} selected={[]} primary={null} /></div>
        <Field label="Área"><select name="area" className="input" defaultValue=""><option value="">—</option><option value="diagramacao">Diagramação</option><option value="social_media">Social Media</option><option value="outro">Outra</option></select></Field>
        <Field label="Início"><input type="date" name="starts_on" className="input" /></Field>
        <Field label="Entrega"><input type="date" name="due_on" className="input" /></Field>
        <Field label="Prioridade"><select name="priority" defaultValue="media" className="input">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Entregável contratado" hint="Se passar da quantidade contratada, a tarefa é marcada como fora do escopo."><select name="deliverable_plan_id" className="input"><option value="">— nenhum —</option>{plans?.map((d) => <option key={d.id} value={d.id}>{d.name} · {String(d.period_month).slice(5, 7)}/{String(d.period_month).slice(0, 4)}</option>)}</select></Field></div>
        <Field label="Serviço do cliente" hint="Opcional. Aparece no cartão e permite ao cliente filtrar por serviço."><select name="service_id" className="input" defaultValue=""><option value="">—</option>{(services as { id: string; client_name: string; service: string }[] | null)?.map((sv) => <option key={sv.id} value={sv.id}>{sv.client_name} — {sv.service}</option>)}</select></Field>
        <Field label="Briefing"><textarea name="briefing" rows={6} className="input" placeholder="Objetivo, formato, referências, textos, restrições da marca…" /></Field><SubmitButton>Criar tarefa</SubmitButton></form></>
  );
}
