'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { templateByKey } from '@/lib/proposal-templates';

const lines = (v: FormDataEntryValue | null) => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
const money = (v: FormDataEntryValue | null) => Number(String(v ?? '0').replace(/\./g, '').replace(',', '.')) || 0;
const dbMsg = (code?: string, fallback = 'Não foi possível concluir a operação.') =>
  code === '42501' ? 'Seu perfil não tem permissão para esta ação (descontos exigem administrador).' : code === '23514' ? 'Valor inválido (ex.: desconto maior que o total).' : fallback;

export async function createProposal(fd: FormData) {
  const { supabase, profile } = await requireModule('propostas');
  const tpl = templateByKey(String(fd.get('template') ?? 'personalizado'));
  const leadId = String(fd.get('lead_id') ?? '') || null;
  let clientId = String(fd.get('client_id') ?? '') || null;
  let display = String(fd.get('client_name') ?? '').trim();

  if (leadId) {
    const { data: lead } = await supabase.from('leads').select('name, company, client_id').eq('id', leadId).maybeSingle();
    if (lead) { display ||= lead.company || lead.name; clientId ??= lead.client_id; }
  } else if (clientId) {
    const { data: c } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle();
    display ||= c?.name ?? '';
  }
  if (!display) flash('/propostas/nova', 'err', 'Informe o cliente ou selecione um lead.');

  const { data, error } = await supabase.from('proposals').insert({
    title: tpl.title, template: tpl.key, lead_id: leadId, client_id: clientId, client_display_name: display,
    content: { ...tpl.content, sobre_cliente: String(fd.get('sobre_cliente') ?? '').trim(), expectativas: String(fd.get('expectativas') ?? '').trim(), resultados: lines(fd.get('resultados')) },
    contract_months: tpl.contractMonths, installments: tpl.installments, owner_id: profile.id, created_by: profile.id,
    valid_until: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
  }).select('id').single();
  if (error) flash('/propostas/nova', 'err', dbMsg(error.code, 'Não foi possível criar a proposta.'));
  await supabase.from('proposal_items').insert(tpl.items.map((it, i) => ({ proposal_id: data!.id, position: i, description: it.description, billing: it.billing, quantity: 1, unit_price: 0 })));
  flash(`/propostas/${data!.id}`, 'ok', 'Rascunho criado. Defina valores e condições antes de enviar.');
}

const saveSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título'), client_display_name: z.string().trim().min(1, 'Informe o nome do cliente'),
  installments: z.coerce.number().int().min(1).max(60), contract_months: z.coerce.number().int().min(1).max(120),
  valid_until: z.preprocess((v) => v || null, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
});

export async function saveProposal(id: string, fd: FormData) {
  const { supabase } = await requireModule('propostas');
  const back = `/propostas/${id}`;
  const r = saveSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash(back, 'err', r.error.issues[0].message);
  const content = {
    intro: String(fd.get('intro') ?? ''), sobre_cliente: String(fd.get('sobre_cliente') ?? ''), expectativas: String(fd.get('expectativas') ?? ''), resultados: lines(fd.get('resultados')), diagnostico: String(fd.get('diagnostico') ?? ''), solucao: String(fd.get('solucao') ?? ''), cronograma: String(fd.get('cronograma') ?? ''),
    objetivos: lines(fd.get('objetivos')), escopo: lines(fd.get('escopo')), entregaveis: lines(fd.get('entregaveis')),
    etapas: lines(fd.get('etapas')).map((l) => { const [t, ...d] = l.split('|'); return { title: t.trim(), description: d.join('|').trim() }; }),
  };
  const { data: before } = await supabase.from('proposals').select('status, discount_value').eq('id', id).single();
  const patch: Record<string, unknown> = { ...r.data, content, payment_terms: String(fd.get('payment_terms') ?? '') };
  const discount = money(fd.get('discount_value'));
  if (Number(before?.discount_value ?? 0) !== discount) patch.discount_value = discount;
  const { error } = await supabase.from('proposals').update(patch).eq('id', id);
  if (error) flash(back, 'err', dbMsg(error.code));
  if (before && before.status !== 'rascunho') await supabase.rpc('proposal_snapshot', { p_id: id, p_note: 'Alteração após envio' });
  revalidatePath(back);
  flash(back, 'ok', before?.status === 'rascunho' ? 'Proposta salva.' : 'Proposta salva — nova versão registrada no histórico.');
}

export async function saveItem(id: string, itemId: string | null, fd: FormData) {
  const { supabase } = await requireModule('propostas');
  const back = `/propostas/${id}`;
  const description = String(fd.get('description') ?? '').trim();
  if (!description) flash(back, 'err', 'Descreva o serviço.');
  const row = { proposal_id: id, description, details: String(fd.get('details') ?? '') || null, billing: fd.get('billing') === 'mensal' ? 'mensal' : 'pontual', quantity: Number(fd.get('quantity') ?? 1) || 1, unit_price: money(fd.get('unit_price')) };
  if (row.unit_price < 0) flash(back, 'err', 'Valor inválido.');
  const { error } = itemId ? await supabase.from('proposal_items').update(row).eq('id', itemId) : await supabase.from('proposal_items').insert({ ...row, position: 99 });
  if (error) flash(back, 'err', 'Não foi possível salvar o item.');
  revalidatePath(back);
  flash(back, 'ok', itemId ? 'Item atualizado.' : 'Item adicionado.');
}

export async function deleteItem(id: string, itemId: string) {
  const { supabase } = await requireModule('propostas');
  await supabase.from('proposal_items').delete().eq('id', itemId);
  revalidatePath(`/propostas/${id}`);
  flash(`/propostas/${id}`, 'ok', 'Item removido.');
}

export async function sendProposal(id: string) {
  const { supabase } = await requireModule('propostas');
  const back = `/propostas/${id}`;
  const [{ data: p }, { data: items }] = await Promise.all([
    supabase.from('proposals').select('status, total_value, valid_until').eq('id', id).single(),
    supabase.from('proposal_items').select('unit_price').eq('proposal_id', id),
  ]);
  if (p?.status !== 'rascunho') flash(back, 'err', 'Apenas rascunhos podem ser enviados.');
  if (!items?.length || items.some((i) => Number(i.unit_price) <= 0)) flash(back, 'err', 'Defina o valor de todos os itens antes de enviar (o sistema não preenche preços).');
  if (!p?.valid_until) flash(back, 'err', 'Defina o prazo de validade.');
  await supabase.rpc('proposal_snapshot', { p_id: id, p_note: 'Versão enviada ao cliente' });
  const { error } = await supabase.from('proposals').update({ status: 'enviada' }).eq('id', id);
  if (error) flash(back, 'err', dbMsg(error.code));
  revalidatePath(back);
  flash(back, 'ok', 'Proposta liberada. Copie o link e envie ao cliente.');
}

export async function setProposalStatus(id: string, status: string) {
  const { supabase } = await requireModule('propostas');
  if (!['em_negociacao', 'aceita', 'recusada'].includes(status)) flash(`/propostas/${id}`, 'err', 'Status inválido.');
  const { error } = await supabase.from('proposals').update({ status }).eq('id', id);
  if (error) flash(`/propostas/${id}`, 'err', dbMsg(error.code));
  revalidatePath(`/propostas/${id}`);
  flash(`/propostas/${id}`, 'ok', 'Status atualizado.');
}

export async function duplicateProposal(id: string) {
  const { supabase, profile } = await requireModule('propostas');
  const [{ data: p }, { data: items }] = await Promise.all([supabase.from('proposals').select('*').eq('id', id).single(), supabase.from('proposal_items').select('*').eq('proposal_id', id).order('position')]);
  if (!p) flash('/propostas', 'err', 'Proposta não encontrada.');
  const { data: copy, error } = await supabase.from('proposals').insert({
    title: `${p!.title} (cópia)`, template: p!.template, lead_id: p!.lead_id, client_id: p!.client_id, client_display_name: p!.client_display_name, content: p!.content,
    payment_terms: p!.payment_terms, installments: p!.installments, contract_months: p!.contract_months, owner_id: profile.id, created_by: profile.id,
  }).select('id').single();
  if (error) flash(`/propostas/${id}`, 'err', 'Não foi possível duplicar.');
  if (items?.length) await supabase.from('proposal_items').insert(items.map((i) => ({ proposal_id: copy!.id, position: i.position, description: i.description, details: i.details, billing: i.billing, quantity: i.quantity, unit_price: i.unit_price })));
  flash(`/propostas/${copy!.id}`, 'ok', 'Proposta duplicada como novo rascunho (desconto e validade precisam ser redefinidos).');
}

export async function activateProposal(id: string, fd: FormData) {
  const { supabase } = await requireModule('propostas');
  const first = String(fd.get('first_due') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) flash(`/propostas/${id}`, 'err', 'Informe o primeiro vencimento.');
  const { error } = await supabase.rpc('activate_proposal', { p_id: id, p_first_due: first });
  if (error) flash(`/propostas/${id}`, 'err', error.code === '42501' ? 'Apenas administrador ou financeiro pode ativar.' : error.code === '23505' ? 'Esta proposta já foi ativada.' : error.message);
  revalidatePath('/financeiro');
  flash(`/propostas/${id}`, 'ok', 'Cliente ativado e recebíveis previstos gerados no Financeiro.');
}
