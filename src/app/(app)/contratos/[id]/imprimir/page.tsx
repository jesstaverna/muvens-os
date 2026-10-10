import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PrintButton } from '@/components/ClientButtons';

export const metadata = { title: 'Contrato — impressão', robots: { index: false } };

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireModule('contratos');
  const { data: c } = await supabase.from('contracts').select('title, body, status').eq('id', id).maybeSingle();
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex items-center justify-between"><Link href={`/contratos/${id}`} className="btn btn-sm">← Voltar</Link><PrintButton label="Imprimir / salvar PDF" /></div>
      {c.status !== 'assinado' && c.status !== 'aprovado' && <p className="mb-4 rounded-lg border border-amber-500/40 p-3 text-sm no-print">Documento ainda não aprovado — apenas para revisão.</p>}
      <article className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed">{c.body}</article>
    </div>
  );
}
