'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { ALLOWED_EXT, ASSET_CATEGORY, extOf } from '@/lib/brand';

const uuid = z.string().uuid();
const back = (id: string, tab = '') => `/brand/${id}${tab ? `?tab=${tab}` : ''}`;
const dbErr = (to: string, e: { code?: string; message: string }): never =>
  flash(to, 'err', e.code === '42501' ? 'Seu perfil não pode alterar o Brand Center (somente administrador, comercial e designer).' : e.code === '23514' ? 'Valor inválido (confira cores #RRGGBB e links https://).' : e.code === '23505' ? 'Registro duplicado.' : 'Não foi possível salvar.');
const opt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null;

export async function saveBrandProfile(clientId: string, fd: FormData) {
  const { supabase } = await requireModule('brand');
  const { error } = await supabase.from('brand_profiles').upsert({ client_id: clientId, tone_of_voice: opt(fd, 'tone_of_voice'), design_rules: opt(fd, 'design_rules'), restrictions: opt(fd, 'restrictions'), ai_instructions: opt(fd, 'ai_instructions') });
  if (error) dbErr(back(clientId, 'regras'), error);
  revalidatePath(`/brand/${clientId}`);
  flash(back(clientId, 'regras'), 'ok', 'Regras da marca salvas.');
}

export async function addColor(clientId: string, fd: FormData) {
  const { supabase } = await requireModule('brand');
  let hex = String(fd.get('hex') ?? '').trim(); if (/^[0-9a-f]{6}$/i.test(hex)) hex = `#${hex}`;
  const name = String(fd.get('name') ?? '').trim();
  if (!name || !/^#[0-9a-f]{6}$/i.test(hex)) flash(back(clientId), 'err', 'Informe o nome e a cor no formato #RRGGBB.');
  const { count } = await supabase.from('brand_colors').select('id', { count: 'exact', head: true }).eq('client_id', clientId);
  const { error } = await supabase.from('brand_colors').insert({ client_id: clientId, name, hex: hex.toUpperCase(), role: String(fd.get('role') ?? 'primaria'), position: count ?? 0 });
  if (error) dbErr(back(clientId), error);
  revalidatePath(`/brand/${clientId}`);
  flash(back(clientId), 'ok', 'Cor adicionada.');
}
export async function removeColor(clientId: string, id: string) { const { supabase } = await requireModule('brand'); await supabase.from('brand_colors').delete().eq('id', id); revalidatePath(`/brand/${clientId}`); flash(back(clientId), 'ok', 'Cor removida.'); }

export async function addFont(clientId: string, fd: FormData) {
  const { supabase } = await requireModule('brand');
  const name = String(fd.get('name') ?? '').trim();
  if (!name) flash(back(clientId), 'err', 'Informe o nome da fonte.');
  const url = opt(fd, 'source_url');
  if (url && !/^https?:\/\//i.test(url)) flash(back(clientId), 'err', 'O link da fonte deve começar com https://');
  const { error } = await supabase.from('brand_fonts').insert({ client_id: clientId, name, usage: String(fd.get('usage') ?? 'texto'), source_url: url });
  if (error) dbErr(back(clientId), error);
  revalidatePath(`/brand/${clientId}`);
  flash(back(clientId), 'ok', 'Fonte adicionada.');
}
export async function removeFont(clientId: string, id: string) { const { supabase } = await requireModule('brand'); await supabase.from('brand_fonts').delete().eq('id', id); revalidatePath(`/brand/${clientId}`); flash(back(clientId), 'ok', 'Fonte removida.'); }

export async function addLink(clientId: string, fd: FormData) {
  const { supabase } = await requireModule('brand');
  const label = String(fd.get('label') ?? '').trim(), url = String(fd.get('url') ?? '').trim();
  if (!label || !/^https?:\/\//i.test(url)) flash(back(clientId), 'err', 'Informe o nome e um link começando com https://');
  const { error } = await supabase.from('brand_links').insert({ client_id: clientId, label, url, kind: String(fd.get('kind') ?? 'outro') });
  if (error) dbErr(back(clientId), error);
  revalidatePath(`/brand/${clientId}`);
  flash(back(clientId), 'ok', 'Link adicionado.');
}
export async function removeLink(clientId: string, id: string) { const { supabase } = await requireModule('brand'); await supabase.from('brand_links').delete().eq('id', id); revalidatePath(`/brand/${clientId}`); flash(back(clientId), 'ok', 'Link removido.'); }

/** Passo 1 do upload: valida e devolve URL assinada de envio (o navegador envia direto ao Storage). */
export async function prepareBrandUpload(clientId: string, fileName: string, size: number): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase } = await requireModule('brand');
  if (!uuid.safeParse(clientId).success) return { error: 'Cliente inválido.' };
  if (!ALLOWED_EXT.includes(extOf(fileName))) return { error: `Formato não permitido (use: ${ALLOWED_EXT.join(', ')}).` };
  if (size > 50 * 1024 * 1024) return { error: 'Arquivo acima de 50 MB.' };
  const path = `${clientId}/${Date.now()}-${fileName.replace(/[^\w.-]+/g, '_').slice(-80)}`;
  const { data, error } = await supabase.storage.from('brand-assets').createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível iniciar o envio (sem permissão?).' };
  return { path, token: data.token };
}
export async function registerBrandAsset(clientId: string, meta: { path: string; name: string; size: number; mime: string; category: string; tags: string; description: string; downloadable: boolean }): Promise<string | null> {
  const { supabase } = await requireModule('brand');
  if (!meta.path.startsWith(`${clientId}/`) || !(meta.category in ASSET_CATEGORY)) return 'Dados inválidos.';
  const { error } = await supabase.from('brand_assets').insert({ client_id: clientId, category: meta.category, name: meta.name.slice(0, 200), description: meta.description.trim() || null, tags: meta.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20), path: meta.path, size: meta.size, mime: meta.mime || null, downloadable: meta.downloadable });
  if (error) return error.code === '42501' ? 'Sem permissão.' : 'Não foi possível registrar o arquivo.';
  revalidatePath(`/brand/${clientId}`);
  return null;
}
export async function updateAsset(clientId: string, id: string, fd: FormData) {
  const { supabase } = await requireModule('brand');
  const { error } = await supabase.from('brand_assets').update({ name: String(fd.get('name') ?? '').trim() || 'Arquivo', category: String(fd.get('category') ?? 'outro'), description: opt(fd, 'description'), tags: String(fd.get('tags') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20), downloadable: fd.get('downloadable') === 'on' }).eq('id', id);
  if (error) dbErr(back(clientId, 'arquivos'), error);
  revalidatePath(`/brand/${clientId}`);
  flash(back(clientId, 'arquivos'), 'ok', 'Arquivo atualizado.');
}
export async function deleteAsset(clientId: string, id: string) {
  const { supabase } = await requireModule('brand');
  const { data } = await supabase.from('brand_assets').select('path').eq('id', id).maybeSingle();
  if (data) { await supabase.storage.from('brand-assets').remove([data.path]); await supabase.from('brand_assets').delete().eq('id', id); }
  revalidatePath(`/brand/${clientId}`);
  flash(back(clientId, 'arquivos'), 'ok', 'Arquivo removido.');
}
