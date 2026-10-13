'use server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAnswers } from '@/lib/leads/qualify';
import { submitQualification } from '@/lib/leads/ingest';

/** Envio do formulário público de qualificação (token do link enviado ao lead). */
export async function enviarQualificacao(token: string, fd: FormData) {
  if (!/^[a-f0-9]{64}$/.test(token)) redirect('/');
  const raw = { dificuldade: fd.get('dificuldade'), precisa: fd.get('precisa'), areas: fd.getAll('areas'), prazo: fd.get('prazo'), invest: fd.get('invest'), decisor: fd.get('decisor'), contato: fd.get('contato') };
  const p = parseAnswers(raw);
  if (!p.ok) redirect(`/qualificar/${token}?err=${encodeURIComponent(p.error)}`);
  const r = await submitQualification(createAdminClient(), token, p.answers);
  redirect(`/qualificar/${token}?${r.ok ? 'ok=1' : `err=${encodeURIComponent('Não foi possível enviar. Tente novamente.')}`}`);
}
