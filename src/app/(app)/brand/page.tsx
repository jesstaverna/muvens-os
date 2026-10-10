import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { ASSET_CATEGORY } from '@/lib/brand';

export const metadata = { title: 'Brand Center' };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Brand({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { supabase } = await requireModule('brand');
  const { q = '', cat = '' } = await searchParams;
  const term = q.replace(/[%,()]/g, ' ').trim();
  const [{ data: clients }, { data: colors }, { data: assets }, { data: profiles }] = await Promise.all([
    supabase.from('clients').select('id, name, segment').order('name'),
    supabase.from('brand_colors').select('client_id, hex, position').order('position'),
    supabase.from('brand_assets').select('client_id'),
    supabase.from('brand_profiles').select('client_id, tone_of_voice, design_rules'),
  ]);
  let hits = null;
  if (term || cat in ASSET_CATEGORY) {
    let aq = supabase.from('brand_assets').select('id, name, category, tags, client_id, clients(name)').order('created_at', { ascending: false }).limit(100);
    if (term) aq = aq.or(`name.ilike.%${term}%,description.ilike.%${term}%,tags.cs.{${term.toLowerCase().replace(/[{}"\\]/g, '')}}`);
    if (cat in ASSET_CATEGORY) aq = aq.eq('category', cat);
    hits = (await aq).data;
  }
  const count = (rows: { client_id: string }[] | null, id: string) => rows?.filter((r) => r.client_id === id).length ?? 0;
  return (
    <>
      <PageHeader title="Brand Center / KV" subtitle="Logos, paletas, tipografia, KV, regras de design e tom de voz de cada cliente." />
      <form method="get" className="mb-8 flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Buscar arquivos por nome, descrição ou tag" className="input max-w-md" aria-label="Buscar arquivos" />
        <select name="cat" defaultValue={cat} className="input w-52" aria-label="Categoria"><option value="">Todas as categorias</option>{Object.entries(ASSET_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn-dark">Buscar</button></form>
      {hits && (
        <section className="mb-10"><h2 className="mb-3 text-base font-semibold">{hits.length} arquivo(s) encontrado(s)</h2>
          {!hits.length ? <Empty title="Nada encontrado" /> : <div className="card overflow-x-auto !p-0"><table className="w-full"><tbody>{hits.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0"><td className="td font-medium">{a.name}</td><td className="td text-muted">{one(a.clients)?.name}</td><td className="td"><span className="badge">{ASSET_CATEGORY[a.category]}</span></td><td className="td text-xs text-muted">{a.tags.join(', ')}</td><td className="td"><Link className="underline" href={`/brand/${a.client_id}?tab=arquivos&cat=${a.category}`}>Abrir</Link></td></tr>))}</tbody></table></div>}</section>)}
      {!clients?.length ? <Empty title="Nenhum cliente" text="Cadastre clientes primeiro; cada cliente tem sua biblioteca de marca." action={<Link href="/clientes/novo" className="btn btn-primary">Novo cliente</Link>} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{clients.map((c) => {
          const sw = colors?.filter((x) => x.client_id === c.id).slice(0, 6) ?? []; const pr = profiles?.find((p) => p.client_id === c.id); const n = count(assets, c.id);
          return (<Link key={c.id} href={`/brand/${c.id}`} className="card block !p-5 transition hover:bg-subtle/60"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.segment ?? '—'}</div>
            <div className="mt-4 flex h-8 overflow-hidden rounded-lg border border-line">{sw.length ? sw.map((x, i) => <span key={i} className="flex-1" style={{ background: x.hex }} title={x.hex} />) : <span className="grid flex-1 place-items-center text-[11px] text-muted">sem paleta</span>}</div>
            <div className="mt-3 flex gap-3 text-xs text-muted"><span>{n} arquivo(s)</span><span>{pr?.tone_of_voice || pr?.design_rules ? 'regras definidas' : 'sem regras'}</span></div></Link>);
        })}</div>)}
    </>
  );
}
