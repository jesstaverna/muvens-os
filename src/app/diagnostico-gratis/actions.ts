'use server';
import { appUrl } from '@/lib/app-url';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { intakeLead, sourceFromUtm } from '@/lib/leads/intake';

/** Envio do formulário público "Diagnóstico gratuito". Filtros simples contra robô: campo-armadilha e tempo mínimo de preenchimento. */
export async function enviarPedido(fd: FormData) {
  const utm = String(fd.get('utm_source') ?? ''); const camp = String(fd.get('utm_campaign') ?? '');
  const back = (q: string) => redirect(`/diagnostico-gratis?${q}${utm ? `&utm_source=${encodeURIComponent(utm)}` : ''}${camp ? `&utm_campaign=${encodeURIComponent(camp)}` : ''}`);
  const shown = Number(fd.get('t') ?? 0);
  if (fd.get('empresa_site_2')) return back('ok=1');                                  // robô preencheu o campo escondido: finge sucesso
  if (!shown || Date.now() - shown < 2500) return back('err=' + encodeURIComponent('Preencha com calma e envie novamente.'));
  if (fd.get('aceite') !== 'on') return back('err=' + encodeURIComponent('Marque a autorização de contato para continuar.'));
  const nome = String(fd.get('nome') ?? '').trim(), email = String(fd.get('email') ?? '').trim(), tel = String(fd.get('telefone') ?? '').trim();
  if (nome.length < 2) return back('err=' + encodeURIComponent('Informe o seu nome.'));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return back('err=' + encodeURIComponent('Informe um e-mail válido.'));
  if (tel.replace(/\D/g, '').length < 10) return back('err=' + encodeURIComponent('Informe o WhatsApp com DDD.'));
  const base = appUrl();
  const r = await intakeLead(createAdminClient(), { nome, email, telefone: tel, empresa: fd.get('empresa'), site: fd.get('site'), source: sourceFromUtm(utm), campaign_name: camp || null }, base);
  if (!r.ok) return back('err=' + encodeURIComponent('Não foi possível enviar agora. Tente novamente em instantes.'));
  return back('ok=1');
}
