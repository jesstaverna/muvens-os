'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { normEmail, normPhone } from '@/lib/domain';

const num = z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(/\./g, '').replace(',', '.'))), z.number().min(0).nullable());
const text = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(2000).nullable());

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do lead').max(200),
  company: text, phone: text, whatsapp: text, email: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().email('E-mail inválido').nullable()),
  segment: text, source: text, service_interest: text,
  estimated_investment: num, potential_value: z.preprocess((v) => (v === '' || v == null ? 0 : Number(String(v).replace(/\./g, '').replace(',', '.'))), z.number().min(0)),
  owner_id: z.preprocess((v) => v || null, z.string().uuid().nullable()),
  stage_id: z.string().uuid('Escolha a etapa'),
  notes: text, next_action: text,
  next_action_at: z.preprocess((v) => (v ? new Date(String(v)).toISOString() : null), z.string().nullable()),
});

function parseLead(fd: FormData) {
  const r = leadSchema.safeParse(Object.fromEntries(fd));
  return r;
}

/** Encontra o lead que causou a violação de unicidade para orientar o usuário. */
async function findDuplicate(supabase: Awaited<ReturnType<typeof requireModule>>['supabase'], email: string | null, phone: string | null) {
  const e = normEmail(email), p = normPhone(phone);
  const ors = [e && `email_norm.eq.${e}`, p && `phone_norm.eq.${p}`].filter(Boolean).join(',');
  if (!ors) return null;
  const { data } = await supabase.from('leads').select('id, name').or(ors).limit(1);
  return data?.[0] ?? null;
}

export async function createLead(fd: FormData) {
  const { supabase, profile } = await requireModule('crm');
  const r = parseLead(fd);
  if (!r.success) flash('/crm/novo', 'err', r.error.issues[0].message);
  const v = r.data;
  if (!v.email && !v.phone && !v.whatsapp) flash('/crm/novo', 'err', 'Informe ao menos e-mail, telefone ou WhatsApp.');
  const { data, error } = await supabase.from('leads').insert({ ...v, created_by: profile.id }).select('id').single();
  if (error) {
    if (error.code === '23505') {
      const dup = await findDuplicate(supabase, v.email, v.whatsapp ?? v.phone);
      if (dup) flash(`/crm/${dup.id}`, 'err', `Contato duplicado: já existe o lead "${dup.name}".`);
      flash('/crm/novo', 'err', 'Já existe um lead com este e-mail ou telefone.');
    }
    flash('/crm/novo', 'err', 'Não foi possível salvar o lead.');
  }
  revalidatePath('/crm');
  flash(`/crm/${data!.id}`, 'ok', 'Lead criado.');
}

export async function updateLead(id: string, fd: FormData) {
  const { supabase } = await requireModule('crm');
  const r = parseLead(fd);
  if (!r.success) flash(`/crm/${id}`, 'err', r.error.issues[0].message);
  const { error } = await supabase.from('leads').update(r.data).eq('id', id);
  if (error) {
    if (error.code === '23505') flash(`/crm/${id}`, 'err', 'Outro lead já usa este e-mail ou telefone.');
    if (error.code === '23514') flash(`/crm/${id}`, 'err', error.message);
    flash(`/crm/${id}`, 'err', 'Não foi possível salvar.');
  }
  revalidatePath('/crm');
  flash(`/crm/${id}`, 'ok', 'Lead atualizado.');
}

/** Usado pelo Kanban (arrastar) e pelo seletor de etapa. Retorna mensagem de erro ou null. */
export async function moveLead(id: string, stageId: string, lostReason?: string): Promise<string | null> {
  const { supabase } = await requireModule('crm');
  const patch: Record<string, unknown> = { stage_id: stageId };
  if (lostReason) patch.lost_reason = lostReason.trim();
  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) return error.code === '23514' ? 'Informe o motivo da perda.' : 'Não foi possível mover o lead.';
  revalidatePath('/crm');
  return null;
}

export async function addInteraction(leadId: string, fd: FormData) {
  const { supabase, profile } = await requireModule('crm');
  const content = String(fd.get('content') ?? '').trim();
  const kind = String(fd.get('kind') ?? 'nota');
  if (!content) flash(`/crm/${leadId}`, 'err', 'Escreva o conteúdo do registro.');
  const { error } = await supabase.from('lead_interactions').insert({ lead_id: leadId, kind, content, created_by: profile.id });
  if (error) flash(`/crm/${leadId}`, 'err', 'Não foi possível registrar.');
  revalidatePath(`/crm/${leadId}`);
  flash(`/crm/${leadId}`, 'ok', 'Registro adicionado ao histórico.');
}

export async function addReminder(leadId: string, fd: FormData) {
  const { supabase, profile } = await requireModule('crm');
  const title = String(fd.get('title') ?? '').trim(), due = String(fd.get('due_at') ?? '');
  if (!title || !due) flash(`/crm/${leadId}`, 'err', 'Informe título e data do lembrete.');
  const { error } = await supabase.from('lead_reminders').insert({ lead_id: leadId, title, due_at: new Date(due).toISOString(), assigned_to: profile.id, created_by: profile.id });
  if (error) flash(`/crm/${leadId}`, 'err', 'Não foi possível criar o lembrete.');
  revalidatePath(`/crm/${leadId}`);
  flash(`/crm/${leadId}`, 'ok', 'Lembrete criado.');
}

export async function completeReminder(leadId: string, reminderId: string) {
  const { supabase } = await requireModule('crm');
  await supabase.from('lead_reminders').update({ done_at: new Date().toISOString() }).eq('id', reminderId);
  revalidatePath(`/crm/${leadId}`);
  redirect(`/crm/${leadId}`);
}
