import { personName } from '@/lib/people';

/** Escolha de responsáveis: marque quem participa e indique o principal (usado nas métricas e nos avisos de atraso). Sem JavaScript: formulário comum. */
export function AssigneePicker({ people, selected, primary, disabled }: { people: { id: string; full_name: string | null; email: string | null }[]; selected: string[]; primary: string | null; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="rounded-xl border border-line p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wider text-muted">Responsáveis</legend>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">{people.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
          <label className="flex min-w-0 items-center gap-2"><input type="checkbox" name="assignee" value={p.id} defaultChecked={selected.includes(p.id) || primary === p.id} /><span className="truncate">{personName(p)}</span></label>
          <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="Responsável principal (métricas e avisos de atraso)"><input type="radio" name="assignee_primary" value={p.id} defaultChecked={primary === p.id} />principal</label>
        </li>))}</ul>
      <p className="mt-2 text-xs text-muted">Marque todas as pessoas envolvidas. O <b>principal</b> é quem responde pela tarefa; quem for incluído recebe um aviso. Sem principal marcado, vale o primeiro da lista.</p>
    </fieldset>
  );
}
