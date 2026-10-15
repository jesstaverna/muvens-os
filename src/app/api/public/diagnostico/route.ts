import { NextResponse, type NextRequest } from 'next/server';
import { appUrl } from '@/lib/app-url';
import { createAnonClient } from '@/lib/supabase/anon';
import { allowedOrigin } from '@/lib/leads/public-form';

export const dynamic = 'force-dynamic';
const cors = (origin: string | null) => ({ 'Access-Control-Allow-Origin': origin ?? 'null', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' });

export async function OPTIONS(req: NextRequest) { const o = allowedOrigin(req.headers.get('origin')); return new NextResponse(null, { status: o ? 204 : 403, headers: o ? cors(o) : {} }); }

/** O diagnóstico já está pronto? O site consulta esta rota depois de enviar o formulário e, quando pronto, leva a pessoa à página personalizada. */
export async function GET(req: NextRequest) {
  const origin = allowedOrigin(req.headers.get('origin'));
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ ready: false, error: 'token inválido' }, { status: 400, headers: cors(origin) });
  const { data } = await createAnonClient().rpc('public_prospect_report', { p_token: token });
  const ready = !!data;
  return NextResponse.json({ ready, url: ready ? `${appUrl()}/diagnostico/${token}` : null }, { headers: { ...cors(origin), 'Cache-Control': 'no-store' } });
}
