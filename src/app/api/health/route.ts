import { NextResponse } from 'next/server';

/** Health check para monitoramento de disponibilidade (UptimeRobot/BetterStack). Não expõe dados. */
export function GET() {
  return NextResponse.json({ ok: true, service: 'muvens-os', time: new Date().toISOString() });
}
