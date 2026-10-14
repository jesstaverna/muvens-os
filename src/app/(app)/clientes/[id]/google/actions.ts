'use server';
import { revalidatePath } from 'next/cache';
import { flash, requireModule } from '@/lib/session';
import { monthStart, parseMetrics } from '@/lib/gmn/metrics';

/** Cria ou atualiza o relatório do mês do cliente (1 por mês). Só administradores e comercial. */
export async function saveGmnReport(clientId: string, fd: FormData) {
  const { supabase, profile } = await requireModule('clientes');
  const back = `/clientes/${clientId}/google`;
  if (!['admin', 'comercial'].includes(profile.role)) flash(back, 'err', 'Seu perfil não pode criar relatórios.');
  const period = monthStart(String(fd.get('period') ?? ''));
  if (!period) flash(back, 'err', 'Escolha o mês do relatório.');
  const m = parseMetrics((k) => fd.get(k));
  if (!m.ok) flash(back, 'err', m.error);
  const row = { client_id: clientId, period, metrics: (m as { ok: true; metrics: object }).metrics, highlights: String(fd.get('highlights') ?? '').trim().slice(0, 2000) || null, next_steps: String(fd.get('next_steps') ?? '').trim().slice(0, 2000) || null };
  const { error } = await supabase.from('gmn_reports').upsert(row, { onConflict: 'client_id,period' });
  if (error) flash(back, 'err', error.code === '42501' ? 'Seu perfil não pode criar relatórios.' : 'Não foi possível salvar o relatório.');
  revalidatePath(back);
  flash(back, 'ok', 'Relatório salvo. Use "Abrir" para ver a página que o cliente recebe.');
}

export async function deleteGmnReport(clientId: string, id: string) {
  const { supabase } = await requireModule('clientes');
  await supabase.from('gmn_reports').delete().eq('id', id).eq('client_id', clientId);
  revalidatePath(`/clientes/${clientId}/google`);
  flash(`/clientes/${clientId}/google`, 'ok', 'Relatório excluído.');
}
