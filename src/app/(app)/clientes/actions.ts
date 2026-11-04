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

const svcErr = (back: string, e: { code?: string }): never => flash(back, 'err', e.code === '42501' ? 'Somente administrador e financeiro cadastram serviços.' : e.code === 'PGRST204' || e.code === '42703' ? 'O banco ainda não tem a atualização de serviços. Rode U_servicos_do_cliente.sql no Supabase.' : 'Não foi possível salvar o serviço.');
const day = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);

/** Cadastro manual de serviço (clientes que não vieram de uma proposta). Valor 0 não entra na receita recorrente. */
export async function addService(clientId: string, fd: FormData) {
  const { supabase } = await requireModule('clientes');
  const back = `/clientes/${clientId}?tab=servicos`;
  const name = String(fd.get('service') ?? '').trim();
  if (name.length < 2) flash(back, 'err', 'Informe o nome do serviço.');
  const value = Math.max(0, Number(String(fd.get('value') ?? '0').replace(/\./g, '').replace(',', '.')) || 0);
  const { error } = await supabase.from('client_services').insert({ client_id: clientId, service: name.slice(0, 200), billing: fd.get('billing') === 'pontual' ? 'pontual' : 'mensal', value, starts_on: day(fd.get('starts_on')) ?? undefined,
    status: ['ativo', 'pausado', 'encerrado'].includes(String(fd.get('status'))) ? String(fd.get('status')) : 'ativo', description: String(fd.get('description') ?? '').trim().slice(0, 2000) || null, portal_visible: fd.get('portal_visible') === 'on' });
  if (error) svcErr(back, error);
  revalidatePath(back);
  flash(back, 'ok', 'Serviço cadastrado.');
}

export async function updateService(clientId: string, serviceId: string, fd: FormData) {
  const { supabase } = await requireModule('clientes');
  const back = `/clientes/${clientId}?tab=servicos`;
  const { error } = await supabase.from('client_services').update({ status: ['ativo', 'pausado', 'encerrado'].includes(String(fd.get('status'))) ? String(fd.get('status')) : 'ativo', ends_on: day(fd.get('ends_on')),
    description: String(fd.get('description') ?? '').trim().slice(0, 2000) || null, portal_visible: fd.get('portal_visible') === 'on' }).eq('id', serviceId).eq('client_id', clientId);
  if (error) svcErr(back, error);
  revalidatePath(back);
  flash(back, 'ok', 'Serviço atualizado.');
}
