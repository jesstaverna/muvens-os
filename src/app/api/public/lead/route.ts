import { NextResponse, type NextRequest } from 'next/server';
import { appUrl } from '@/lib/app-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { intakeLead } from '@/lib/leads/intake';
import { allowedOrigin, rateLimited, sourceFromUtm } from '@/lib/leads/public-form';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const cors = (origin: string | null) => ({ 'Access-Control-Allow-Origin': origin ?? 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
const json = (origin: string | null, body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors(origin) });

export async function OPTIONS(req: NextRequest) {
  const o = allowedOrigin(req.headers.get('origin'));
  return new NextResponse(null, { status: o ? 204 : 403, headers: o ? cors(o) : {} });
}

/**
 * Recebe o formulário de diagnóstico do site da Muvens (página criada no Lovable), inclusive de anúncios (UTM).
 * Cria o lead no CRM, a análise do site e os rascunhos; devolve o token do diagnóstico para o site acompanhar o andamento.
 */
export async function POST(req: NextRequest) {
  const origin = allowedOrigin(req.headers.get('origin'));
  if (!origin) return NextResponse.json({ ok: false, error: 'origem não permitida' }, { status: 403 });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sem-ip';
  if (rateLimited(ip)) return json(origin, { ok: false, error: 'muitas tentativas; aguarde alguns minutos' }, 429);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return json(origin, { ok: false, error: 'corpo inválido' }, 400);
  if (b.hp) return json(origin, { ok: true });                                           // campo-armadilha preenchido: finge sucesso
  const t = Number(b.t ?? 0); const age = t > 1e12 ? Date.now() - t : t;   // t = ms desde que a página abriu (aceita também o instante de abertura)
  if (!t || age < 2500 || age > 86_400_000) return json(origin, { ok: false, error: 'preencha com calma e envie novamente' }, 400);
  if (b.aceite !== true) return json(origin, { ok: false, error: 'é preciso autorizar o contato' }, 400);
  const nome = String(b.nome ?? '').trim(), email = String(b.email ?? '').trim(), tel = String(b.telefone ?? '').trim();
  if (nome.length < 2) return json(origin, { ok: false, error: 'informe o nome' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(origin, { ok: false, error: 'informe um e-mail válido' }, 400);
  if (tel.replace(/\D/g, '').length < 10) return json(origin, { ok: false, error: 'informe o WhatsApp com DDD' }, 400);
  const s = (k: string) => { const v = String(b[k] ?? '').trim().slice(0, 200); return v || null; };
  const db = createAdminClient();
  try {
    const r = await intakeLead(db, { nome, email, telefone: tel, empresa: s('empresa'), site: s('site'), instagram: s('instagram'), source: sourceFromUtm(s('utm_source'), s('utm_medium')), campaign_name: s('utm_campaign'), ad_name: s('utm_content'), utm_medium: s('utm_medium'), utm_term: s('utm_term'), pagina: s('page_url') }, appUrl());
    if (!r.ok) return json(origin, { ok: false, error: 'não foi possível registrar agora' }, 500);
    let prospectId = r.prospectId ?? null;
    if (!prospectId && r.leadId) prospectId = (await db.from('prospects').select('id').eq('lead_id', r.leadId).limit(1).maybeSingle()).data?.id ?? null;
    const token = prospectId ? (await db.from('prospects').select('report_token').eq('id', prospectId).maybeSingle()).data?.report_token ?? null : null;
    // diagnóstico personalizado só existe quando o formulário trouxe o site; sem site, o front mostra apenas o agradecimento
    const hasDiagnosis = !!s('site') && !!token;
    return json(origin, { ok: true, duplicate: r.duplicate ?? false, diagnosis: hasDiagnosis ? 'pending' : 'none', token: hasDiagnosis ? token : null, status_url: hasDiagnosis ? `${appUrl()}/api/public/diagnostico?token=${token}` : null });
  } catch { return json(origin, { ok: false, error: 'falha ao registrar' }, 500); }
}
