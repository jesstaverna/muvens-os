import { requirePortal } from '@/lib/session';
import { decide } from '../actions';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Aprovações' };
type Item = { id: string; title: string; project: string; due_on: string | null; description: string | null; files: { id: string; name: string }[] };

export default async function Aprovacoes() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_approvals');
  const items = (data ?? []) as Item[];
  return (
    <>
      <h1 className="h1">Aprovações</h1><p className="mb-8 mt-1.5 text-sm text-muted">Peças aguardando a sua decisão. Ao aprovar, a equipe segue para a entrega final.</p>
      {!items.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nada aguardando aprovação. 🎉</div> : (
        <div className="space-y-6">{items.map((i) => (
          <section key={i.id} className="card"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold">{i.title}</h2><span className="text-xs text-muted">{i.project}{i.due_on ? ` · prazo ${dateBR(i.due_on)}` : ''}</span></div>
            {i.description && <p className="mt-2 whitespace-pre-line text-sm text-muted">{i.description}</p>}
            {i.files.length > 0 && <ul className="mt-4 flex flex-wrap gap-2">{i.files.map((f) => <li key={f.id}><a className="btn btn-sm" href={`/cliente/arquivo?kind=task&id=${f.id}`} target="_blank" rel="noreferrer">Ver / baixar {f.name}</a></li>)}</ul>}
            <form className="mt-5 space-y-3"><label className="block"><span className="label">Comentário (obrigatório para pedir ajustes)</span><textarea name="comment" rows={3} className="input" /></label>
              <div className="flex flex-wrap gap-2"><button formAction={decide.bind(null, i.id, 'aprovar')} className="btn btn-primary">Aprovar</button><button formAction={decide.bind(null, i.id, 'ajustes')} className="btn">Solicitar ajustes</button></div></form></section>))}</div>)}
    </>
  );
}
