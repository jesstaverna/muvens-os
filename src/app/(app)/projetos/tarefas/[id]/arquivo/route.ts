import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** URL assinada de 60 s para baixar um arquivo da tarefa (bucket privado; RLS limita à equipe). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = new URL(req.url).searchParams.get('f') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(f)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: file } = await supabase.from('task_files').select('path, name').eq('id', f).eq('task_id', id).maybeSingle();
  if (!file) return new NextResponse('Not found', { status: 404 });
  const { data } = await supabase.storage.from('task-files').createSignedUrl(file.path, 60, { download: file.name });
  if (!data?.signedUrl) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
