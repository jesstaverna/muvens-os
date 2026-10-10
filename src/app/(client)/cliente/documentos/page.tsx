import { requirePortal } from '@/lib/session';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Documentos' };
type Doc = { kind: 'doc' | 'task'; id: string; name: string; category: string; context?: string; created_at: string };
const CAT: Record<string, string> = { documento: 'Documentos', arquivo_final: 'Arquivos finais', relatorio: 'Relatórios de desempenho' };

export default async function Documentos() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_documents');
  const docs = (data ?? []) as Doc[];
  return (
    <>
      <h1 className="h1 mb-8">Documentos</h1>
      {!docs.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nenhum documento compartilhado ainda.</div> : (
        <div className="space-y-8">{Object.entries(CAT).map(([k, label]) => { const list = docs.filter((d) => d.category === k); if (!list.length) return null; return (
          <section key={k}><h2 className="mb-3 text-base font-semibold">{label}</h2><div className="card divide-y divide-line !p-0">{list.map((d) => (
            <div key={`${d.kind}-${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><div><div className="font-medium">{d.name}</div><div className="text-xs text-muted">{d.context ? `${d.context} · ` : ''}{dateBR(d.created_at)}</div></div><a className="btn btn-sm" href={`/cliente/arquivo?kind=${d.kind}&id=${d.id}`} target="_blank" rel="noreferrer">Baixar</a></div>))}</div></section>); })}</div>)}
    </>
  );
}
