import { requireModule } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { PlanForm } from '@/components/MarketingPlanForm';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Novo planejamento de marketing | MUVENS OS' };
export default async function NovoMarketing() {
  const { profile } = await requireModule('marketing');
  const canEdit = ['admin','comercial','trafego'].includes(profile.role);
  return <>
    <PageHeader title="Novo planejamento" subtitle="Estruture a estratégia antes de ativar campanhas e conteúdos."
      actions={<LinkButton href="/marketing" className="btn">← Central de Marketing</LinkButton>}/>
    <div className="card max-w-4xl">
      <PlanForm plan={null} canEdit={canEdit} />
    </div>
  </>;
}
