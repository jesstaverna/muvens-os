import Link from 'next/link';
import { CheckCircle2, Circle, LockKeyhole } from 'lucide-react';
import { type MarketingActivity, planProgress } from '@/lib/marketing';
import { toggleMarketingChecklist } from '@/app/(app)/marketing/actions';

export function MarketingLaunchChecklist({
  planId, activities, canEdit,
}: {
  planId: string;
  activities: MarketingActivity[];
  canEdit: boolean;
}) {
  const items = activities.filter((item) => item.kind === 'checklist');
  const progress = planProgress(items);
  const ratio = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Conferência de pré-lançamento</h2>
          <p className="mt-1 text-sm text-muted">
            Marque cada item apenas após confirmar o funcionamento. A marcação é manual, não um teste automático.
          </p>
        </div>
        <Link
          href={'/marketing?plan=' + encodeURIComponent(planId) + '&tab=rastreamento'}
          className="btn btn-sm"
        >
          Conferir links com UTM
        </Link>
      </div>
      <div className="card !p-5">
        <div className="mb-3 flex flex-wrap justify-between gap-2">
          <div className="text-sm font-semibold">
            {progress.done} de {progress.total} verificações concluídas
          </div>
          <div className="text-sm font-medium text-muted">{ratio}%</div>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-label="Progresso da conferência de lançamento"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ratio}
        >
          <div className="h-full rounded-full bg-lime transition-[width]" style={{width:ratio+'%'}} />
        </div>
        <p className="mt-3 text-xs text-muted">
          {progress.total && progress.done === progress.total
            ? 'Todas as verificações foram marcadas. A ativação ainda deve ser feita e validada no Gerenciador de Anúncios.'
            : 'Há itens pendentes. Não ative a campanha antes de validar o fluxo de conversão e o orçamento.'}
        </p>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const completed = item.status === 'concluido';
          return (
            <article key={item.id} className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-surface p-5">
              <span aria-hidden="true" className={
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl ' +
                (completed ? 'bg-lime text-black' : 'bg-subtle text-muted')
              }>
                {completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                {item.description&&<p className="mt-1 whitespace-pre-wrap text-xs text-muted">{item.description}</p>}
                <span className="mt-2 inline-flex text-[11px] font-medium text-muted">
                  {completed ? 'Conferido manualmente' : 'Aguardando validação'}
                </span>
              </div>
              {canEdit
                ? <form action={toggleMarketingChecklist.bind(null,planId,item.id,!completed)}>
                    <button type="submit" className={completed ? 'btn btn-sm' : 'btn btn-primary btn-sm'}>
                      {completed ? 'Reabrir' : 'Marcar conferido'}
                    </button>
                  </form>
                : <span className="inline-flex items-center gap-1 text-xs text-muted">
                    <LockKeyhole className="h-3.5 w-3.5" /> Leitura
                  </span>}
            </article>
          );
        })}
        {!items.length && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            Nenhuma verificação cadastrada. Adicione os itens de lançamento no plano de marketing.
          </div>
        )}
      </div>
    </section>
  );
}
