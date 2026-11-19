import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportSchema } from '@/lib/diagnostics';
import { DiagnosticReport } from '@/components/DiagnosticReport';

export const dynamic = 'force-dynamic';
export const metadata = {title:'Diagnóstico estratégico | Muvens',robots:{index:false,follow:false}};

export default async function PublicDigitalReport({params}:{params:Promise<{token:string}>}) {
  const {token} = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  // O visitante não recebe acesso ao Supabase; somente 3 campos aprovados são
  // consultados no servidor depois de verificar o token e o estado publicado.
  const {data,error} = await createAdminClient().from('digital_diagnostics')
    .select('company_name,report,published_at')
    .eq('report_token',token).eq('status','publicado').maybeSingle();
  if (error || !data) notFound();
  const parsed = reportSchema.safeParse(data.report);
  if (!parsed.success) notFound();
  return (
    <main className="min-h-screen bg-[#F8F8F5]">
      <DiagnosticReport company={data.company_name} report={parsed.data} publishedAt={data.published_at}/>
    </main>
  );
}
