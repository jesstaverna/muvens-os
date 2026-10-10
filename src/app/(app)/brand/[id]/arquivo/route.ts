import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';

/** Download autorizado: URL assinada de 60 s. Arquivos com download restrito só saem para administradores. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = new URL(req.url).searchParams.get('f') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(f)) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (!s) return new NextResponse('Unauthorized', { status: 401 });
  const supabase = await createClient();
  const { data: a } = await supabase.from('brand_assets').select('path, name, downloadable').eq('id', f).eq('client_id', id).maybeSingle();
  if (!a) return new NextResponse('Not found', { status: 404 });
  if (!a.downloadable && s.profile.role !== 'admin') return new NextResponse('Download restrito ao administrador', { status: 403 });
  const { data } = await supabase.storage.from('brand-assets').createSignedUrl(a.path, 60, { download: a.name });
  if (!data?.signedUrl) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
