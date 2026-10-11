import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { money } from '@/lib/format';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Clientes' };
const TONE: Record<string, string> = { ativo: 'bg-lime/40', pausado: 'bg-amber-500/15 text-warn', encerrado: 'bg-subtle text-muted' };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { supabase, profile } = await requireModule('clientes');
  const { q = '', status = '' } = await searchParams;
  const term = q.replace(/[%,()]/g, ' ').trim();
  let query = supabase.from('clients').select('id, name, segment, status, email, phone').order('name').limit(300);
  if (term) query = query.or(`name.ilike.%${term}%,legal_name.ilike.%${term}%,email.ilike.%${term}%`);
  if (['ativo', 'pausado', 'encerrado'].includes(status)) query = query.eq('status', status);
  const seeMoney = ['admin', 'comercial', 'financeiro'].includes(profile.role);
  const [{ data: clients }, { data: services }] = await Promise.all([
    query,
    seeMoney ? supabase.from('client_services').select('client_id, value').eq('billing', 'mensal').eq('status', 'ativo') : Promise.resolve({ data: [] as { client_id: string; value: number }[] }),
  ]);
  const mrr = new Map<string, number>();
  services?.forEach((s) => mrr.set(s.client_id, (mrr.get(s.client_id) ?? 0) + Number(s.value)));
  const canCreate = ['admin', 'comercial', 'financeiro'].includes(profile.role);

  return (
    <>
      <PageHeader title="Clientes" subtitle="Cadastro único compartilhado por CRM, propostas e financeiro." actions={canCreate ? <LinkButton href="/clientes/novo" className="btn btn-primary">Novo cliente</LinkButton> : undefined} />
      <form className="mb-6 flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="input max-w-sm" aria-label="Buscar clientes" />
        <select name="status" defaultValue={status} className="input w-44" aria-label="Situação"><option value="">Todas as situações</option><option value="ativo">Ativos</option><option value="pausado">Pausados</option><option value="encerrado">Encerrados</option></select>
        <button className="btn btn-dark">Filtrar</button>
      </form>
      {!clients?.length ? <Empty title="Nenhum cliente" text="Clientes são criados automaticamente quando uma proposta é aceita, ou manualmente aqui." action={canCreate ? <LinkButton href="/clientes/novo" className="btn btn-primary">Novo cliente</LinkButton> : undefined} /> : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full"><thead><tr className="border-b border-line"><th className="th">Cliente</th><th className="th">Segmento</th><th className="th">Contato</th>{seeMoney && <th className="th">Mensalidade</th>}<th className="th">Situação</th></tr></thead>
            <tbody>{clients.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0 hover:bg-subtle/60">
                <td className="td"><Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td><td className="td">{c.segment ?? '—'}</td>
                <td className="td text-muted">{c.email ?? c.phone ?? '—'}</td>{seeMoney && <td className="td">{mrr.has(c.id) ? money(mrr.get(c.id)) : '—'}</td>}
                <td className="td"><span className={`badge ${TONE[c.status]}`}>{c.status}</span></td></tr>))}</tbody></table>
        </div>)}
    </>
  );
}
