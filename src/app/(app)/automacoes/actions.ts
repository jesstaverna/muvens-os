'use server';
import { revalidatePath } from 'next/cache';
import { flash, requireModule } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { runWorker } from '@/lib/worker';

/** Executa o processador agora (mesmo que o agendador): fila de jobs, análise, busca semanal, aprovação automática e envio de e-mails (com todas as travas). Só administradores. */
export async function runWorkerNow() {
  await requireModule('automacoes');
  let msg: string;
  try {
    const r = await runWorker(createAdminClient());
    const p = r.prospecting as Record<string, { sent?: number; failed?: number; analyzed?: number; created?: number; approved?: number; error?: string; skipped?: string }>;
    const bad = Object.entries(p).filter(([, v]) => v?.error).map(([k, v]) => `${k}: ${v.error}`);
    msg = `Processador executado. Jobs: ${r.done} ok, ${r.failed} com falha. Analisadas: ${p.analysis?.analyzed ?? 0}. E-mails enviados: ${p.outbox?.sent ?? 0}.${bad.length ? ` Atenção: ${bad.join(' | ')}` : ''}`;
  } catch (e) { msg = `Falha ao executar: ${e instanceof Error ? e.message : 'erro'}`; }
  revalidatePath('/automacoes');
  flash('/automacoes', 'ok', msg);
}
