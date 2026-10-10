'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { parseDuration } from '@/lib/domain';

const optId = z.preprocess((v) => v || null, z.string().uuid().nullable());
const optDate = z.preprocess((v) => v || null, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').nullable());
const optText = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(5000).nullable());
const dbErr = (back: string, e: { code?: string; message: string }): never =>
  flash(back, 'err', e.code === '42501' ? 'Seu perfil não tem permissão para esta ação.' : e.code === '23514' ? e.message : 'Não foi possível concluir a operação.');

const projectSchema = z.object({
  client_id: z.string().uuid('Escolha o cliente'), name: z.string().trim().min(2, 'Informe o nome do projeto'),
  status: z.enum(['planejamento', 'em_andamento', 'pausado', 'concluido', 'cancelado']).default('planejamento'),
  starts_on: optDate, due_on: optDate, owner_id: optId, notes: optText, client_visible: z.preprocess((v) => v === 'on', z.boolean()),
});

export async function createProject(fd: FormData) {
  const { supabase, profile } = await requireModule('projetos');
  const r = projectSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash('/projetos/novo', 'err', r.error.issues[0].message);
  const { data, error } = await supabase.from('projects').insert({ ...r.data, created_by: profile.id }).select('id').single();
  if (error) dbErr('/projetos/novo', error);
  revalidatePath('/projetos');
  flash(`/projetos/${data!.id}`, 'ok', 'Projeto criado.');
}

export async function updateProject(id: string, fd: FormData) {
  const { supabase } = await requireModule('projetos');
  const r = projectSchema.omit({ client_id: true }).safeParse(Object.fromEntries(fd));
  if (!r.success) flash(`/projetos/${id}`, 'err', r.error.issues[0].message);
  const { error } = await supabase.from('projects').update(r.data).eq('id', id);
  if (error) dbErr(`/projetos/${id}`, error);
  revalidatePath(`/projetos/${id}`);
  flash(`/projetos/${id}`, 'ok', 'Projeto atualizado.');
}

const taskSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título da tarefa'), briefing: optText, assignee_id: optId, due_on: optDate,
  priority: z.enum(['baixa', 'media', 'alta', 'urgente']).default('media'),
});

export async function createTask(fd: FormData) {
  const { supabase, profile } = await requireModule('projetos');
  const projectId = String(fd.get('project_id') ?? '');
  const back = `/projetos/tarefas/nova?project=${projectId}`;
  if (!/^[0-9a-f-]{36}$/.test(projectId)) flash('/projetos/tarefas/nova', 'err', 'Escolha o projeto.');
  const r = taskSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash(back, 'err', r.error.issues[0].message);
  const plan = String(fd.get('deliverable_plan_id') ?? '') || null;
  const { data, error } = await supabase.from('tasks').insert({ ...r.data, project_id: projectId, deliverable_plan_id: plan, created_by: profile.id }).select('id, out_of_scope').single();
  if (error) dbErr(back, error);
  revalidatePath('/projetos');
  flash(`/projetos/tarefas/${data!.id}`, data!.out_of_scope ? 'err' : 'ok', data!.out_of_scope ? 'Tarefa criada, mas EXCEDE a quantidade contratada: marcada como fora do escopo (orçar à parte).' : 'Tarefa criada.');
}

export async function updateTask(id: string, fd: FormData) {
  const { supabase } = await requireModule('projetos');
  const back = `/projetos/tarefas/${id}`;
  const r = taskSchema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash(back, 'err', r.error.issues[0].message);
  const { error } = await supabase.from('tasks').update({ ...r.data, internal: fd.get('internal') === 'on', briefing_public: String(fd.get('briefing_public') ?? '').trim() || null, out_of_scope: fd.get('out_of_scope') === 'on', out_of_scope_note: String(fd.get('out_of_scope_note') ?? '').trim() || null }).eq('id', id);
  if (error) dbErr(back, error);
  revalidatePath(back);
  flash(back, 'ok', 'Tarefa atualizada.');
}

/** Kanban: devolve mensagem de erro (ou null). As regras do fluxo de aprovação vêm do banco. */
export async function moveTask(id: string, status: string): Promise<string | null> {
  const { supabase } = await requireModule('projetos');
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) return error.code === '23514' || error.code === '42501' ? error.message : 'Não foi possível mover a tarefa.';
  revalidatePath('/projetos');
  return null;
}

export async function setTaskStatus(id: string, status: string, fd: FormData) {
  const { supabase, profile } = await requireModule('projetos');
  const back = `/projetos/tarefas/${id}`;
  const note = String(fd.get('note') ?? '').trim();
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) dbErr(back, error);
  if (note) await supabase.from('task_comments').insert({ task_id: id, author_id: profile.id, body: note });
  revalidatePath(back);
  flash(back, 'ok', 'Status atualizado.');
}

export async function addChecklistItem(taskId: string, fd: FormData) {
  const { supabase } = await requireModule('projetos');
  const text = String(fd.get('text') ?? '').trim();
  if (!text) flash(`/projetos/tarefas/${taskId}`, 'err', 'Escreva o item.');
  await supabase.from('task_checklist_items').insert({ task_id: taskId, text, position: Date.now() % 1_000_000_000 });
  revalidatePath(`/projetos/tarefas/${taskId}`);
  flash(`/projetos/tarefas/${taskId}`, 'ok', 'Item adicionado.');
}
export async function toggleChecklistItem(taskId: string, itemId: string, done: boolean) {
  const { supabase } = await requireModule('projetos');
  await supabase.from('task_checklist_items').update({ done }).eq('id', itemId);
  revalidatePath(`/projetos/tarefas/${taskId}`);
}
export async function removeChecklistItem(taskId: string, itemId: string) {
  const { supabase } = await requireModule('projetos');
  await supabase.from('task_checklist_items').delete().eq('id', itemId);
  revalidatePath(`/projetos/tarefas/${taskId}`);
}

export async function addComment(taskId: string, fd: FormData) {
  const { supabase, profile } = await requireModule('projetos');
  const body = String(fd.get('body') ?? '').trim();
  if (!body) flash(`/projetos/tarefas/${taskId}`, 'err', 'Escreva o comentário.');
  const { error } = await supabase.from('task_comments').insert({ task_id: taskId, author_id: profile.id, body });
  if (error) dbErr(`/projetos/tarefas/${taskId}`, error);
  revalidatePath(`/projetos/tarefas/${taskId}`);
  flash(`/projetos/tarefas/${taskId}`, 'ok', 'Comentário publicado.');
}

export async function logTime(taskId: string, fd: FormData) {
  const { supabase, profile } = await requireModule('projetos');
  const back = `/projetos/tarefas/${taskId}`;
  const minutes = parseDuration(String(fd.get('duration') ?? ''));
  if (!minutes) flash(back, 'err', 'Informe o tempo como 1:30 ou 1,5 (horas), até 24h.');
  const day = String(fd.get('worked_on') ?? '');
  const { error } = await supabase.from('time_entries').insert({ task_id: taskId, user_id: profile.id, minutes, worked_on: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined, note: String(fd.get('note') ?? '').trim() || null });
  if (error) dbErr(back, error);
  revalidatePath(back);
  flash(back, 'ok', 'Horas registradas.');
}
export async function deleteTime(taskId: string, entryId: string) {
  const { supabase } = await requireModule('projetos');
  await supabase.from('time_entries').delete().eq('id', entryId);
  revalidatePath(`/projetos/tarefas/${taskId}`);
  flash(`/projetos/tarefas/${taskId}`, 'ok', 'Lançamento removido.');
}

/** Upload direto ao Storage (o navegador envia o arquivo; evita o limite de corpo das funções serverless). */
export async function prepareTaskUpload(taskId: string, fileName: string): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase } = await requireModule('projetos');
  if (!/^[0-9a-f-]{36}$/.test(taskId)) return { error: 'Tarefa inválida.' };
  const path = `${taskId}/${Date.now()}-${fileName.replace(/[^\w.-]+/g, '_').slice(-80)}`;
  const { data, error } = await supabase.storage.from('task-files').createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível iniciar o envio (sem permissão?).' };
  return { path, token: data.token };
}
export async function registerTaskFile(taskId: string, path: string, name: string, size: number): Promise<string | null> {
  const { supabase } = await requireModule('projetos');
  if (!path.startsWith(`${taskId}/`)) return 'Caminho inválido.';
  const { error } = await supabase.from('task_files').insert({ task_id: taskId, path, name: name.slice(0, 200), size });
  if (error) return 'Não foi possível registrar o arquivo.';
  revalidatePath(`/projetos/tarefas/${taskId}`);
  return null;
}
export async function deleteTaskFile(taskId: string, fileId: string) {
  const { supabase } = await requireModule('projetos');
  const { data } = await supabase.from('task_files').select('path').eq('id', fileId).maybeSingle();
  if (data) { await supabase.storage.from('task-files').remove([data.path]); await supabase.from('task_files').delete().eq('id', fileId); }
  revalidatePath(`/projetos/tarefas/${taskId}`);
  flash(`/projetos/tarefas/${taskId}`, 'ok', 'Arquivo removido.');
}

export async function createPlan(fd: FormData) {
  const { supabase, profile } = await requireModule('projetos');
  const month = String(fd.get('period_month') ?? '');
  const qty = Number(fd.get('quantity'));
  const name = String(fd.get('name') ?? '').trim();
  const back = '/projetos?view=entregaveis';
  if (!/^\d{4}-\d{2}$/.test(month) || !name || !(qty > 0)) flash(back, 'err', 'Informe cliente, nome, mês e quantidade.');
  const { error } = await supabase.from('deliverable_plans').insert({ client_id: String(fd.get('client_id')), project_id: String(fd.get('project_id') ?? '') || null, name, period_month: `${month}-01`, quantity: Math.floor(qty), created_by: profile.id });
  if (error) flash(back, 'err', error.code === '23505' ? 'Já existe esse entregável para o cliente neste mês.' : error.code === '42501' ? 'Apenas administrador ou comercial define entregáveis contratados.' : 'Não foi possível salvar.');
  revalidatePath('/projetos');
  flash(back, 'ok', 'Entregável contratado criado.');
}

export async function saveRate(fd: FormData) {
  const { supabase } = await requireModule('projetos');
  const v = Number(String(fd.get('hourly_cost') ?? '').replace(/\./g, '').replace(',', '.'));
  if (!(v >= 0)) flash('/projetos?view=rentabilidade', 'err', 'Custo/hora inválido.');
  const { error } = await supabase.from('staff_rates').upsert({ user_id: String(fd.get('user_id')), hourly_cost: v, updated_at: new Date().toISOString() });
  if (error) flash('/projetos?view=rentabilidade', 'err', 'Apenas administrador ou financeiro define custo/hora.');
  revalidatePath('/projetos');
  flash('/projetos?view=rentabilidade', 'ok', 'Custo/hora salvo.');
}

export async function toggleFileVisible(taskId: string, fileId: string, visible: boolean) {
  const { supabase } = await requireModule('projetos');
  await supabase.from('task_files').update({ client_visible: visible }).eq('id', fileId);
  revalidatePath(`/projetos/tarefas/${taskId}`);
  flash(`/projetos/tarefas/${taskId}`, 'ok', visible ? 'Arquivo visível ao cliente (aparece na aprovação e, depois de aprovado, nos documentos).' : 'Arquivo oculto do cliente.');
}
