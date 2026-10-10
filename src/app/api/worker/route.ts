import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runWorker } from '@/lib/worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Processador da fila de automações. Acionado por um agendador EXTERNO (Vercel Cron, pg_cron+pg_net, n8n)
 * a cada ~5 min — por isso funciona 24/7 sem navegador aberto. Idempotente: pode ser chamado em paralelo.
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const result = await runWorker(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[worker] falha', e);
    return NextResponse.json({ ok: false, error: 'worker_failed' }, { status: 500 });
  }
}
export const GET = handle;   // Vercel Cron usa GET
export const POST = handle;
