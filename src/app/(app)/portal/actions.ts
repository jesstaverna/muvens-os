'use server';
import { revalidatePath } from 'next/cache';
import { flash, requireModule } from '@/lib/session';
import { ALLOWED_EXT, extOf } from '@/lib/brand';

export async function respondRequest(id: string, fd: FormData) {
  const { supabase, profile } = await requireModule('portal');
  const status = String(fd.get('status') ?? 'em_andamento');
  if (!['aberta', 'em_andamento', 'resolvida'].includes(status)) flash('/portal', 'err', 'Status inválido.');
  const response = String(fd.get('response') ?? '').trim();
  const patch: Record<string, unknown> = { status };
  if (response) Object.assign(patch, { response, responded_by: profile.id, responded_at: new Date().toISOString() });
  const { error } = await supabase.from('client_requests').update(patch).eq('id', id);
  if (error) flash('/portal', 'err', 'Não foi possível salvar a resposta.');
  revalidatePath('/portal');
  flash('/portal', 'ok', response ? 'Resposta enviada ao cliente.' : 'Status atualizado.');
}

export async function prepareClientDoc(clientId: string, fileName: string, size: number): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase } = await requireModule('portal');
  if (!/^[0-9a-f-]{36}$/.test(clientId)) return { error: 'Cliente inválido.' };
  if (!ALLOWED_EXT.includes(extOf(fileName))) return { error: 'Formato não permitido.' };
  if (size > 50 * 1024 * 1024) return { error: 'Arquivo acima de 50 MB.' };
  const path = `${clientId}/${Date.now()}-${fileName.replace(/[^\w.-]+/g, '_').slice(-80)}`;
  const { data, error } = await supabase.storage.from('client-docs').createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível iniciar o envio (sem permissão?).' };
  return { path, token: data.token };
}
export async function registerClientDoc(clientId: string, meta: { path: string; name: string; size: number; category: string }): Promise<string | null> {
  const { supabase } = await requireModule('portal');
  if (!meta.path.startsWith(`${clientId}/`) || !['documento', 'arquivo_final', 'relatorio'].includes(meta.category)) return 'Dados inválidos.';
  const { error } = await supabase.from('client_documents').insert({ client_id: clientId, name: meta.name.slice(0, 200), path: meta.path, size: meta.size, category: meta.category });
  if (error) return 'Não foi possível registrar o documento.';
  revalidatePath('/portal');
  return null;
}
export async function deleteClientDoc(id: string) {
  const { supabase } = await requireModule('portal');
  const { data } = await supabase.from('client_documents').select('path').eq('id', id).maybeSingle();
  if (data) { await supabase.storage.from('client-docs').remove([data.path]); await supabase.from('client_documents').delete().eq('id', id); }
  revalidatePath('/portal');
  flash('/portal?tab=documentos', 'ok', 'Documento removido do portal.');
}
