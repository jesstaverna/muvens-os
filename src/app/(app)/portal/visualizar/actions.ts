'use server';
import { revalidatePath } from 'next/cache';
import { requireModule } from '@/lib/session';
import { COLUMNS, type ColumnKey } from '@/lib/projects/board';
import { columnTarget, statusPath } from '@/lib/projects/flow';

const uuid = /^[0-9a-f-]{36}$/;
const isCol = (c: string): c is ColumnKey => COLUMNS.some((x) => x.key === c);
const fail = (e: { code?: string; message: string }) => (e.code === '23514' || e.code === '42501' ? e.message : 'Não foi possível concluir a operação.');

/** Arrastar um cartão para outra coluna: percorre as etapas permitidas (as regras do fluxo continuam no banco). Devolve o erro, se houver. */
export async function moveCard(taskId: string, column: string): Promise<string | null> {
  const { supabase } = await requireModule('portal');
  if (!uuid.test(taskId) || !isCol(column)) return 'Cartão inválido.';
  const { data: t } = await supabase.from('tasks').select('status, area').eq('id', taskId).maybeSingle();
  if (!t) return 'Tarefa não encontrada.';
  const tgt = columnTarget(column);
  const path = statusPath(t.status, tgt.status);
  if (path === null) return 'Esta tarefa já foi entregue/cancelada: só um administrador pode reabrir.';
  if (tgt.area && t.area !== tgt.area) { const { error } = await supabase.from('tasks').update({ area: tgt.area }).eq('id', taskId); if (error) return fail(error); }
  for (const status of path) { const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId); if (error) return fail(error); }
  revalidatePath('/portal/visualizar'); revalidatePath('/projetos');
  return null;
}

/** Criar cartão direto na coluna (estilo Trello). */
export async function addCard(clientId: string, projectId: string, column: string, title: string): Promise<string | null> {
  const { supabase, profile } = await requireModule('portal');
  const name = title.trim();
  if (!uuid.test(clientId) || !uuid.test(projectId) || !isCol(column)) return 'Dados inválidos.';
  if (name.length < 2 || name.length > 200) return 'Informe um título (2 a 200 caracteres).';
  const { data: p } = await supabase.from('projects').select('id').eq('id', projectId).eq('client_id', clientId).neq('status', 'cancelado').maybeSingle();
  if (!p) return 'Projeto não encontrado para este cliente.';
  const tgt = columnTarget(column);
  const { error } = await supabase.from('tasks').insert({ project_id: projectId, title: name, status: tgt.status, area: tgt.area ?? null, created_by: profile.id });
  if (error) return fail(error);
  revalidatePath('/portal/visualizar'); revalidatePath('/projetos');
  return null;
}
