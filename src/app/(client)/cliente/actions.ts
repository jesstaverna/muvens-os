'use server';
import { revalidatePath } from 'next/cache';
import { flash, requirePortal } from '@/lib/session';

export async function decide(taskId: string, decision: 'aprovar' | 'ajustes', fd: FormData) {
  const { supabase } = await requirePortal();
  const comment = String(fd.get('comment') ?? '').trim();
  const { error } = await supabase.rpc('portal_decide', { p_task: taskId, p_decision: decision, p_comment: comment || null });
  if (error) flash('/cliente/aprovacoes', 'err', error.code === '22023' ? error.message : error.code === '23514' ? 'Este item já foi respondido.' : 'Não foi possível registrar sua resposta. Tente novamente.');
  revalidatePath('/cliente', 'layout');
  flash('/cliente/aprovacoes', 'ok', decision === 'aprovar' ? 'Aprovação registrada. Obrigado!' : 'Pedido de ajustes enviado à equipe.');
}

export async function createRequest(fd: FormData) {
  const { supabase } = await requirePortal();
  const kind = String(fd.get('kind') ?? 'atendimento');
  const { error } = await supabase.rpc('portal_create_request', { p_kind: kind, p_subject: String(fd.get('subject') ?? ''), p_body: String(fd.get('body') ?? '') });
  if (error) flash('/cliente/solicitacoes', 'err', error.code === '23514' ? 'Preencha assunto e mensagem (mínimo de 3 caracteres).' : 'Não foi possível enviar. Tente novamente.');
  revalidatePath('/cliente/solicitacoes');
  flash('/cliente/solicitacoes', 'ok', 'Recebemos sua mensagem. Nossa equipe responderá por aqui.');
}

// ---------- quadro de demandas ----------
const msg = (code: string | undefined, text: string, fallback: string) => (code === '22023' || code === '23514' ? text : fallback);
const ok = /^[0-9a-f-]{36}$/;

export async function createClientTask(fd: FormData) {
  const { supabase } = await requirePortal();
  const due = String(fd.get('due_on') ?? '').trim();
  const { data, error } = await supabase.rpc('portal_create_task', {
    p_project: String(fd.get('project_id') ?? ''), p_area: String(fd.get('area') ?? ''), p_title: String(fd.get('title') ?? ''), p_description: String(fd.get('description') ?? ''),
    p_due: due || null, p_link: String(fd.get('link') ?? '').trim() || null,
  });
  if (error) flash('/cliente/quadro/nova', 'err', error.code === '22023' ? error.message : error.code === '42501' ? 'Escolha um dos seus projetos.' : 'Não foi possível enviar. Tente novamente.');
  revalidatePath('/cliente', 'layout');
  flash(`/cliente/quadro/${data}`, 'ok', 'Demanda enviada! A equipe vai analisar e definir os prazos.');
}

export async function addTaskLink(taskId: string, fd: FormData) {
  const { supabase } = await requirePortal(); const back = `/cliente/quadro/${taskId}`;
  if (!ok.test(taskId)) flash('/cliente/quadro', 'err', 'Item não encontrado.');
  const { error } = await supabase.rpc('portal_add_link', { p_task: taskId, p_url: String(fd.get('url') ?? ''), p_label: String(fd.get('label') ?? '') || null, p_kind: String(fd.get('kind') ?? 'conteudo') });
  if (error) flash(back, 'err', msg(error.code, error.message, 'Não foi possível salvar o link.'));
  revalidatePath('/cliente', 'layout');
  flash(back, 'ok', 'Link enviado à equipe.');
}

export async function addTaskComment(taskId: string, fd: FormData) {
  const { supabase } = await requirePortal(); const back = `/cliente/quadro/${taskId}`;
  if (!ok.test(taskId)) flash('/cliente/quadro', 'err', 'Item não encontrado.');
  const { error } = await supabase.rpc('portal_add_comment', { p_task: taskId, p_body: String(fd.get('body') ?? '') });
  if (error) flash(back, 'err', msg(error.code, error.message, 'Não foi possível enviar a mensagem.'));
  revalidatePath(back);
  flash(back, 'ok', 'Mensagem enviada.');
}

export async function contentSent(taskId: string) {
  const { supabase } = await requirePortal(); const back = `/cliente/quadro/${taskId}`;
  if (!ok.test(taskId)) flash('/cliente/quadro', 'err', 'Item não encontrado.');
  const { error } = await supabase.rpc('portal_content_sent', { p_task: taskId });
  if (error) flash(back, 'err', msg(error.code, error.message, 'Não foi possível registrar.'));
  revalidatePath('/cliente', 'layout');
  flash(back, 'ok', 'Avisamos a equipe de que o conteúdo foi enviado.');
}

export async function requestChange(taskId: string, fd: FormData) {
  const { supabase } = await requirePortal(); const back = `/cliente/quadro/${taskId}`;
  if (!ok.test(taskId)) flash('/cliente/quadro', 'err', 'Item não encontrado.');
  const { data, error } = await supabase.rpc('portal_request_change', { p_task: taskId, p_body: String(fd.get('body') ?? '') });
  if (error) flash(back, 'err', msg(error.code, error.message, 'Não foi possível enviar o pedido.'));
  revalidatePath('/cliente', 'layout');
  flash(`/cliente/quadro/${data}`, 'ok', 'Pedido de alteração enviado. Ele aparece como uma nova demanda.');
}

export async function decideOnTask(taskId: string, decision: 'aprovar' | 'ajustes', fd: FormData) {
  const { supabase } = await requirePortal(); const back = `/cliente/quadro/${taskId}`;
  if (!ok.test(taskId)) flash('/cliente/quadro', 'err', 'Item não encontrado.');
  const { error } = await supabase.rpc('portal_decide', { p_task: taskId, p_decision: decision, p_comment: String(fd.get('comment') ?? '').trim() || null });
  if (error) flash(back, 'err', error.code === '22023' ? error.message : error.code === '23514' ? 'Este item já foi respondido.' : 'Não foi possível registrar sua resposta. Tente novamente.');
  revalidatePath('/cliente', 'layout');
  flash(back, 'ok', decision === 'aprovar' ? 'Aprovação registrada. Obrigado!' : 'Pedido de ajustes enviado à equipe.');
}
