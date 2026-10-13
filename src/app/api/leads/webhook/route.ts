import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { intakeLead } from '@/lib/leads/intake';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.LEADS_WEBHOOK_SECRET; if (!secret) return false;
  const got = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Diagnóstico: informa se o segredo está configurado neste deploy (nunca mostra o valor). Abra o endereço no navegador. */
export async function GET() {
  const secret = process.env.LEADS_WEBHOOK_SECRET;
  return NextResponse.json({ ok: true, configured: !!secret, secret_length: secret ? secret.length : 0, hint: secret ? 'O segredo existe neste deploy. Se o Zapier dá "unauthorized", o valor do cabeçalho x-webhook-secret está diferente.' : 'LEADS_WEBHOOK_SECRET não existe neste deploy: cadastre na Vercel (Production) e faça Redeploy.' });
}

/**
 * Recebe leads de anúncios (Meta Lead Ads via Make/Zapier/n8n) e de formulários. Autenticação por segredo (LEADS_WEBHOOK_SECRET).
 * Cria o lead no CRM, o prospecto para análise do site, o link de qualificação e os RASCUNHOS de contato (nada é enviado sem aprovação).
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body) ? body.slice(0, 20) : [body];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const db = createAdminClient(); const out: unknown[] = [];
  for (const raw of items) {
    try { const r = await intakeLead(db, raw, appUrl); out.push({ ok: r.ok, duplicate: r.duplicate ?? false, lead_id: r.leadId ?? null, error: r.error }); }
    catch (e) { out.push({ ok: false, error: e instanceof Error ? e.message : 'falha' }); }
  }
  return NextResponse.json(Array.isArray(body) ? { results: out } : out[0], { status: 200 });
}
