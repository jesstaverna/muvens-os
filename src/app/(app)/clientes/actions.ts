'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';

const opt = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(500).nullable());
const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cliente').max(200),
  legal_name: opt, document: opt, email: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().email('E-mail inválido').nullable()),
  phone: opt, segment: opt, website: opt, address: opt, notes: opt,
  status: z.enum(['ativo', 'pausado', 'encerrado']).default('ativo'),
});

export async function saveClient(id: string | null, fd: FormData) {
  const { supabase, profile } = await requireModule('clientes');
  const back = id ? `/clientes/${id}` : '/clientes/novo';
  const r = schema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash(back, 'err', r.error.issues[0].message);
  const q = id ? supabase.from('clients').update(r.data).eq('id', id).select('id').single() : supabase.from('clients').insert({ ...r.data, created_by: profile.id }).select('id').single();
  const { data, error } = await q;
  if (error) flash(back, 'err', error.code === '23505' ? 'Já existe um cliente com este documento.' : error.code === '42501' ? 'Seu perfil não pode editar clientes.' : 'Não foi possível salvar o cliente.');
  revalidatePath('/clientes');
  flash(`/clientes/${data!.id}`, 'ok', id ? 'Cliente atualizado.' : 'Cliente criado.');
}

export async function addContact(clientId: string, fd: FormData) {
  const { supabase } = await requireModule('clientes');
  const name = String(fd.get('name') ?? '').trim();
  if (!name) flash(`/clientes/${clientId}`, 'err', 'Informe o nome do contato.');
  const { error } = await supabase.from('client_contacts').insert({ client_id: clientId, name, role_title: String(fd.get('role_title') ?? '') || null, email: String(fd.get('email') ?? '') || null, phone: String(fd.get('phone') ?? '') || null });
  if (error) flash(`/clientes/${clientId}`, 'err', 'Não foi possível adicionar o contato.');
  revalidatePath(`/clientes/${clientId}`);
  flash(`/clientes/${clientId}`, 'ok', 'Contato adicionado.');
}

export async function removeContact(clientId: string, contactId: string) {
  const { supabase } = await requireModule('clientes');
  await supabase.from('client_contacts').delete().eq('id', contactId);
  revalidatePath(`/clientes/${clientId}`);
  flash(`/clientes/${clientId}`, 'ok', 'Contato removido.');
}
