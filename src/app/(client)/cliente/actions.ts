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
