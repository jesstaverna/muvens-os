import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Meus serviços' };
type Svc = { id: string; name: string; billing: 'mensal' | 'pontual'; status: string; starts_on: string; ends_on: string | null; description: string | null; open_tasks: number; done_tasks: number };

export default async function Servicos() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_services');
  const list = (data ?? []) as Svc[];
  return (
    <>
      <h1 className="h1">Meus serviços</h1><p className="mb-8 mt-1.5 text-sm text-muted">O que a Muvens faz por você e o andamento das demandas de cada serviço.</p>
      {!list.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nenhum serviço cadastrado ainda. Fale com a equipe se algo estiver faltando.</div> : (
        <div className="grid gap-4 md:grid-cols-2">{list.map((s) => (
          <section key={s.id} className="card"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-base font-semibold">{s.name}</h2><span className={`badge ${s.status === 'ativo' ? 'bg-lime/40' : ''}`}>{s.status === 'ativo' ? 'Ativo' : 'Pausado'}</span></div>
            <p className="mt-1 text-xs text-muted">{s.billing === 'mensal' ? 'Contrato mensal' : 'Projeto pontual'} · desde {dateBR(s.starts_on)}{s.ends_on ? ` · até ${dateBR(s.ends_on)}` : ''}</p>
            {s.description && <p className="mt-3 whitespace-pre-line text-sm">{s.description}</p>}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm"><span className="text-muted">{s.open_tasks} em andamento · {s.done_tasks} finalizada{s.done_tasks === 1 ? '' : 's'}</span><Link href={`/cliente/quadro?s=${s.id}`} className="underline">Ver demandas</Link></div></section>))}</div>)}
    </>
  );
}
