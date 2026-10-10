import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Redireciona para uma URL assinada de 60s do comprovante (bucket privado; RLS limita a admin/financeiro). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: tx } = await supabase.from('fin_transactions').select('attachment_path').eq('id', id).maybeSingle(); // RLS: só financeiro/admin
  if (!tx?.attachment_path) return new NextResponse('Not found', { status: 404 });
  const { data } = await supabase.storage.from('finance-receipts').createSignedUrl(tx.attachment_path, 60);
  if (!data?.signedUrl) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
