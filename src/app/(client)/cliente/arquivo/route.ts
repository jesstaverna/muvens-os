import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';

/**
 * Download para o cliente: a função portal_file_path (com o JWT do cliente) AUTORIZA o acesso; só então o servidor gera
 * uma URL assinada de 60 s com a service role (clientes não têm acesso direto ao Storage).
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get('kind') ?? '', id = u.searchParams.get('id') ?? '';
  if (!['doc', 'task'].includes(kind) || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (!s || s.profile.role !== 'cliente' || !s.profile.active) return new NextResponse('Unauthorized', { status: 401 });
  const { data, error } = await (await createClient()).rpc('portal_file_path', { p_kind: kind, p_id: id });
  if (error || !data) return new NextResponse('Not found', { status: 404 });
  const f = data as { bucket: string; path: string; name: string };
  const { data: signed } = await createAdminClient().storage.from(f.bucket).createSignedUrl(f.path, 60, { download: f.name });
  if (!signed?.signedUrl) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
