import { notFound } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase/anon';
import { Landing } from './Landing';
import type { SiteFindings } from '@/lib/prospecting/analysis';
import { dateTimeBR } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Diagnóstico de presença digital', robots: { index: false, follow: false } };

/** Diagnóstico público (link do e-mail). Mostra só a análise de dados públicos; não expõe contatos. */
export default async function DiagnosticoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data } = await createAnonClient().rpc('public_prospect_report', { p_token: token });
  if (!data) notFound();
  const r = data as { name: string; category: string | null; website: string | null; rating: number | null; reviews_count: number | null; score: number | null; recommended_service: string | null; analyzed_at: string; site: SiteFindings | null; observations: string[] };
  return <Landing name={r.name} category={r.category} website={r.website} rating={r.rating} reviews={r.reviews_count} score={r.score} service={r.recommended_service} site={r.site} observations={r.observations} analyzed generatedAt={dateTimeBR(r.analyzed_at)} whatsapp={process.env.NEXT_PUBLIC_CONTACT_WHATSAPP} email={process.env.NEXT_PUBLIC_CONTACT_EMAIL} />;
}
