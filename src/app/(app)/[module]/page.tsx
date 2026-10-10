import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { MODULES } from '@/lib/permissions';
import { PageHeader, Pending } from '@/components/ui';

const PHASE = { 2: 'Fase 2 — Operação', 3: 'Fase 3 — Integrações', 4: 'Fase 4 — Inteligência' } as const;

/** Módulos de fases futuras: página honesta, sem botões decorativos nem dados simulados. */
export default async function PlannedModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const def = MODULES.find((m) => m.href === `/${module}` && m.phase > 1);
  if (!def) notFound();
  await requireModule(def.key);
  return (
    <>
      <PageHeader title={def.label} subtitle={def.summary} actions={<Pending>{PHASE[def.phase as 2 | 3 | 4]}</Pending>} />
      <div className="card max-w-3xl">
        <p className="text-sm">Este módulo ainda <strong>não foi implementado</strong>. Nenhum dado é simulado aqui. Escopo previsto:</p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-muted">{def.planned?.map((p) => <li key={p}>{p}</li>)}</ul>
        {def.phase === 3 && <p className="mt-5 rounded-xl bg-subtle p-4 text-sm">Integração <strong>pendente</strong>: depende de contas/credenciais autorizadas (ver Configurações → Integrações). A arquitetura já reserva as tabelas e o ponto de entrada de webhooks.</p>}
      </div>
    </>
  );
}
