'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { splitInstallments } from '@/lib/domain';

const BACK = '/financeiro';
const moneyNum = z.preprocess((v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')), z.number().positive('Informe um valor maior que zero'));
const optId = z.preprocess((v) => v || null, z.string().uuid().nullable());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

const txSchema = z.object({
  direction: z.enum(['in', 'out']), description: z.string().trim().min(2, 'Descreva o lançamento'), amount: moneyNum, due_date: date,
  category_id: optId, client_id: optId, installments: z.coerce.number().int().min(1).max(60).default(1),
  status: z.enum(['previsto', 'emitido', 'liquidado']).default('previsto'), notes: z.preprocess((v) => v || null, z.string().max(1000).nullable()),
});

function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export async function createTransaction(fd: FormData) {
  const { supabase, profile } = await requireModule('financeiro');
  const r = txSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash(`${BACK}?tab=novo`, 'err', r.error.issues[0].message);
  const v = r.data;
  const parts = splitInstallments(v.amount, v.installments);
  const group = v.installments > 1 ? crypto.randomUUID() : null;
  const rows = parts.map((amount, i) => ({
    direction: v.direction, description: v.installments > 1 ? `${v.description} (${i + 1}/${v.installments})` : v.description, amount, category_id: v.category_id, client_id: v.client_id,
    due_date: addMonths(v.due_date, i), status: i === 0 ? v.status : 'previsto', installment_no: group ? i + 1 : null, installment_total: group ? v.installments : null, installment_group: group, notes: v.notes, created_by: profile.id,
  }));
  const { error } = await supabase.from('fin_transactions').insert(rows);
  if (error) flash(`${BACK}?tab=novo`, 'err', 'Não foi possível salvar o lançamento.');
  revalidatePath(BACK);
  flash(`${BACK}?tab=${v.direction === 'in' ? 'receber' : 'pagar'}`, 'ok', v.installments > 1 ? `${v.installments} parcelas criadas.` : 'Lançamento criado.');
}

export async function setTransactionStatus(id: string, status: 'previsto' | 'emitido' | 'liquidado' | 'cancelado', tab: string, fd?: FormData) {
  const { supabase } = await requireModule('financeiro');
  const patch: Record<string, unknown> = { status };
  if (status === 'liquidado') {
    const paid = String(fd?.get('paid_on') ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(paid)) patch.paid_at = `${paid}T12:00:00-03:00`;
    const amt = String(fd?.get('paid_amount') ?? '').trim();
    if (amt) { const n = Number(amt.replace(/\./g, '').replace(',', '.')); if (!(n > 0)) flash(`${BACK}?tab=${tab}`, 'err', 'Valor pago inválido.'); patch.paid_amount = n; }
  }
  const { error } = await supabase.from('fin_transactions').update(patch).eq('id', id);
  if (error) flash(`${BACK}?tab=${tab}`, 'err', 'Não foi possível atualizar o lançamento.');
  revalidatePath(BACK);
  flash(`${BACK}?tab=${tab}`, 'ok', { emitido: 'Cobrança marcada como emitida.', liquidado: 'Pagamento registrado.', cancelado: 'Lançamento cancelado.', previsto: 'Voltou para previsto.' }[status]);
}

const recSchema = z.object({
  description: z.string().trim().min(2, 'Descreva a despesa'), vendor: z.preprocess((v) => v || null, z.string().max(120).nullable()), direction: z.enum(['in', 'out']), amount: moneyNum,
  day_of_month: z.coerce.number().int().min(1).max(31), category_id: optId, client_id: optId, starts_on: date,
  ends_on: z.preprocess((v) => v || null, date.nullable()), is_subscription: z.preprocess((v) => v === 'on', z.boolean()),
});

export async function saveRecurring(fd: FormData) {
  const { supabase } = await requireModule('financeiro');
  const r = recSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash(`${BACK}?tab=recorrentes`, 'err', r.error.issues[0].message);
  const { error } = await supabase.from('fin_recurring').insert(r.data);
  if (error) flash(`${BACK}?tab=recorrentes`, 'err', 'Não foi possível salvar a recorrência.');
  revalidatePath(BACK);
  flash(`${BACK}?tab=recorrentes`, 'ok', 'Recorrência criada. Os lançamentos do mês são gerados pelo botão ou automaticamente pelo worker.');
}

export async function toggleRecurring(id: string, active: boolean) {
  const { supabase } = await requireModule('financeiro');
  await supabase.from('fin_recurring').update({ active }).eq('id', id);
  revalidatePath(BACK);
  flash(`${BACK}?tab=recorrentes`, 'ok', active ? 'Recorrência reativada.' : 'Recorrência pausada.');
}

export async function generateMonth() {
  const { supabase } = await requireModule('financeiro');
  const { data, error } = await supabase.rpc('generate_recurring', { p_month: new Date().toISOString().slice(0, 10) });
  if (error) flash(`${BACK}?tab=recorrentes`, 'err', 'Não foi possível gerar os lançamentos.');
  revalidatePath(BACK);
  flash(`${BACK}?tab=recorrentes`, 'ok', data ? `${data} lançamento(s) gerado(s) para este mês.` : 'Nada novo a gerar: este mês já está completo.');
}

const MAX = 5 * 1024 * 1024, TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export async function uploadReceipt(id: string, tab: string, fd: FormData) {
  const { supabase } = await requireModule('financeiro');
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) flash(`${BACK}?tab=${tab}`, 'err', 'Selecione um arquivo.');
  const f = file as File;
  if (f.size > MAX) flash(`${BACK}?tab=${tab}`, 'err', 'Arquivo acima de 5 MB.');
  if (!TYPES.includes(f.type)) flash(`${BACK}?tab=${tab}`, 'err', 'Use PDF, PNG ou JPG.');
  const path = `${id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
  const up = await supabase.storage.from('finance-receipts').upload(path, f, { contentType: f.type, upsert: false });
  if (up.error) flash(`${BACK}?tab=${tab}`, 'err', 'Falha no envio do comprovante.');
  await supabase.from('fin_transactions').update({ attachment_path: path }).eq('id', id);
  revalidatePath(BACK);
  flash(`${BACK}?tab=${tab}`, 'ok', 'Comprovante anexado.');
}
