import { notFound } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase/anon';
import { dateTimeBR } from '@/lib/format';
import { Audit } from './Audit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Auditoria gratuita do Google Meu Negócio', robots: { index: false, follow: false } };

/** Auditoria gratuita do perfil no Google (link do e-mail para negócios locais). Mesmos dados e mesmo token do diagnóstico; não expõe contatos. */
export default async function AuditoriaGoogle({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params; const { p: preview } = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const db = createAnonClient();
  const { data } = await db.rpc('public_prospect_report', { p_token: token });
  if (!data) notFound();
  if (preview !== '1') await db.rpc('record_report_view', { p_token: token });
  const r = data as { name: string; category: string | null; website: string | null; rating: number | null; reviews_count: number | null; score: number | null; recommended_service: string | null; analyzed_at: string; site: never; observations: string[]; from_google?: boolean; has_phone?: boolean; google_details?: { photos_count?: number; has_hours?: boolean } | null; prices?: Record<string, { from: number; unit: string }> };
  return <Audit name={r.name} category={r.category} website={r.website} rating={r.rating} reviews={r.reviews_count} score={r.score} service={r.recommended_service} site={r.site} observations={r.observations} analyzed fromGoogle={r.from_google ?? true} hasPhone={r.has_phone} googleDetails={r.google_details} generatedAt={dateTimeBR(r.analyzed_at)} price={r.prices?.google_meu_negocio} whatsapp={process.env.NEXT_PUBLIC_CONTACT_WHATSAPP} email={process.env.NEXT_PUBLIC_CONTACT_EMAIL} />;
}
