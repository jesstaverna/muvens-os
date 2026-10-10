import Link from 'next/link';
import { requireModule, flash } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR } from '@/lib/format';
import { revalidatePath } from 'next/cache';

async function markAllRead() {
  'use server';
  const { supabase } = await requireModule('dashboard');
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) flash('/alertas', 'err', 'Não foi possível marcar como lidos.');
  revalidatePath('/', 'layout');
  flash('/alertas', 'ok', 'Alertas marcados como lidos.');
}

const TONE = { critical: 'border-danger/40 text-danger', warning: 'border-amber-500/40 text-warn', info: 'border-line text-muted' } as const;

export const metadata = { title: 'Alertas' };

export default async function Alertas() {
  const { supabase } = await requireModule('dashboard');
  const { data } = await supabase.from('notifications').select('id, severity, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title="Alertas" subtitle="Gerados automaticamente pelo worker — funcionam 24h, mesmo sem ninguém logado."
        actions={<form action={markAllRead}><SubmitButton className="btn btn-sm" pendingText="…">Marcar todos como lidos</SubmitButton></form>} />
      {!data?.length ? <Empty title="Nenhum alerta" text="Quando houver pagamentos atrasados, oportunidades paradas ou propostas aceitas, eles aparecem aqui." /> : (
        <ul className="space-y-3">
          {data.map((n) => (
            <li key={n.id} className={`card flex items-start justify-between gap-4 !p-4 ${n.read_at ? 'opacity-60' : ''}`}>
              <div>
                <span className={`badge ${TONE[n.severity as keyof typeof TONE]}`}>{n.severity === 'critical' ? 'Crítico' : n.severity === 'warning' ? 'Atenção' : 'Info'}</span>
                <div className="mt-2 text-sm font-medium">{n.title}</div>
                {n.body && <div className="mt-0.5 text-sm text-muted">{n.body}</div>}
                <div className="mt-1 text-xs text-muted">{dateTimeBR(n.created_at)}</div>
              </div>
              {n.link && <Link href={n.link} className="btn btn-sm shrink-0">Abrir</Link>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
