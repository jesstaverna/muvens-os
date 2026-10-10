'use server';
import { revalidatePath } from 'next/cache';
import { flash, requireModule } from '@/lib/session';

const MSG: Record<string, string> = { '42501': 'Seu perfil não tem permissão para esta ação.', '23514': '' };
const fail = (back: string, e: { code?: string; message: string }): never => flash(back, 'err', MSG[e.code ?? ''] || e.message || 'Não foi possível concluir a operação.');

export async function generateContract(proposalId: string) {
  const { supabase } = await requireModule('contratos');
  const { data, error } = await supabase.rpc('generate_contract', { p_proposal: proposalId });
  if (error) fail(`/propostas/${proposalId}`, error);
  revalidatePath('/contratos');
  flash(`/contratos/${data}`, 'ok', 'Rascunho de contrato gerado. A revisão humana é obrigatória.');
}

export async function saveContract(id: string, fd: FormData) {
  const { supabase } = await requireModule('contratos');
  const date = (k: string) => { const v = String(fd.get(k) ?? ''); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
  const patch: Record<string, unknown> = { title: String(fd.get('title') ?? '').trim(), starts_on: date('starts_on'), ends_on: date('ends_on'), readjust_on: date('readjust_on') };
  if (fd.has('body')) patch.body = String(fd.get('body'));
  const { error } = await supabase.from('contracts').update(patch).eq('id', id);
  if (error) fail(`/contratos/${id}`, error);
  revalidatePath(`/contratos/${id}`);
  flash(`/contratos/${id}`, 'ok', 'Contrato salvo.');
}

export async function setContractStatus(id: string, status: string, fd?: FormData) {
  const { supabase } = await requireModule('contratos');
  const patch: Record<string, unknown> = { status };
  if (status === 'assinado') {
    const d = String(fd?.get('signed_on') ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) patch.signed_at = `${d}T12:00:00-03:00`;
    patch.signature_note = String(fd?.get('signature_note') ?? '').trim() || null;
  }
  const { error } = await supabase.from('contracts').update(patch).eq('id', id);
  if (error) fail(`/contratos/${id}`, error);
  revalidatePath('/contratos'); revalidatePath(`/contratos/${id}`);
  flash(`/contratos/${id}`, 'ok', { em_revisao: 'Enviado para revisão.', rascunho: 'Voltou para rascunho.', aprovado: 'Contrato aprovado.', assinado: 'Assinatura registrada. Cliente ativado e financeiro gerado.', cancelado: 'Contrato cancelado.' }[status] ?? 'Status atualizado.');
}

export async function saveTemplate(id: string, fd: FormData) {
  const { supabase } = await requireModule('contratos');
  const { error } = await supabase.from('contract_templates').update({ name: String(fd.get('name') ?? '').trim(), body: String(fd.get('body') ?? ''), active: fd.get('active') === 'on' }).eq('id', id);
  if (error) fail('/contratos/modelos', error);
  revalidatePath('/contratos/modelos');
  flash('/contratos/modelos', 'ok', 'Modelo salvo (vale para novos contratos).');
}

export async function saveAgency(fd: FormData) {
  const { supabase } = await requireModule('contratos');
  const f = (k: string) => String(fd.get(k) ?? '').trim() || null;
  const { error } = await supabase.from('agency_settings').update({ legal_name: f('legal_name'), document: f('document'), address: f('address'), city: f('city'), representative_name: f('representative_name'), representative_role: f('representative_role'), email: f('email') }).eq('id', 1);
  if (error) fail('/contratos/modelos', error);
  revalidatePath('/contratos/modelos');
  flash('/contratos/modelos', 'ok', 'Dados da agência salvos.');
}
