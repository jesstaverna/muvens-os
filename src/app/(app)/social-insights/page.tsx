import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateBR } from '@/lib/format';
import { todayBR } from '@/lib/domain';
import { saveSocialPeriod, saveSocialPost, deleteSocialPost } from './actions';

export const metadata={title:'Desempenho das redes | MUVENS OS'};
const PLATFORMS={instagram:'Instagram',facebook:'Facebook',linkedin:'LinkedIn'} as const;
const formatNumber=(v:number|string|null|undefined)=>Number(v??0).toLocaleString('pt-BR');
const reported=(p:any,metric:string)=>p?.source==='manual'||p?.metric_flags?.[metric]===true;

export default async function SocialInsights({searchParams}:{searchParams:Promise<{m?:string}>}){
  const {supabase}=await requireModule('social-insights');
  const sp=await searchParams;
  const current=todayBR().slice(0,7);
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m??'')?sp.m!:current;
  const {data:client}=await supabase.from('clients').select('id').eq('name','MUVENS').maybeSingle();
  const [{data:periods,error:periodError},{data:posts,error:postError}]=client?await Promise.all([
    supabase.from('social_period_metrics').select('*').eq('client_id',client.id).eq('period_start',month+'-01').order('platform'),
    supabase.from('social_post_metrics').select('*').eq('client_id',client.id).order('published_on',{ascending:false}).limit(30),
  ]):[{data:[],error:null},{data:[],error:null}];
  return <>
    <PageHeader title="Desempenho nas redes" subtitle="MUVENS · alcance, interações e publicações de destaque, com dados verificados." actions={<Link href="/inicio" className="btn">← Início</Link>}/>
    <div className="mb-6 rounded-2xl border border-line bg-subtle p-4 text-sm text-muted">
      <strong className="text-fg">Fonte de dados:</strong> API oficial das contas autorizadas ou preenchimento manual pelos relatórios das plataformas. Métricas não disponibilizadas pela API aparecem como “—”.
      <Link href="/configuracoes/redes" className="ml-1 font-semibold underline">Gerenciar conexões</Link>
    </div>
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <Field label="Mês de referência"><input type="month" name="m" defaultValue={month} className="input"/></Field>
      <button className="btn btn-dark" type="submit">Consultar</button>
    </form>
    <section className="mb-8 grid gap-4 md:grid-cols-3">
      {(Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map(network=>{
        const p=(periods??[]).find((r:any)=>r.platform===network);
        return <article key={network} className="card">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">{PLATFORMS[network]}</h2><span className="badge">{p?'Registrado':'Sem dados'}</span></div>
          {p?<dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-muted">Alcance</dt><dd className="mt-1 text-xl font-bold">{reported(p,'reach')?formatNumber(p.reach):'—'}</dd></div>
            <div><dt className="text-xs text-muted">Interações</dt><dd className="mt-1 text-xl font-bold">{reported(p,'engagements')?formatNumber(p.engagements):'—'}</dd></div>
            <div><dt className="text-xs text-muted">Visitas</dt><dd className="font-semibold">{reported(p,'profile_visits')?formatNumber(p.profile_visits):'—'}</dd></div>
            <div><dt className="text-xs text-muted">Cliques</dt><dd className="font-semibold">{reported(p,'link_clicks')?formatNumber(p.link_clicks):'—'}</dd></div>
          </dl>:<p className="text-sm leading-6 text-muted">Informe os resultados do mês nos campos abaixo para acompanhar este canal.</p>}
        </article>;
      })}
    </section>
    {(periodError||postError)&&<div role="alert" className="mb-6 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
      Os dados não puderam ser carregados. Confira as migrações e as permissões.
    </div>}
    {!client&&<div role="alert" className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      O cadastro interno MUVENS precisa existir antes do registro das métricas.
    </div>}
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <section className="card">
        <h2 className="text-lg font-semibold">Registrar resultados do mês</h2>
        <p className="mb-5 mt-1 text-xs text-muted">Uma linha por rede e mês. Salvar novamente atualiza os indicadores desse mesmo período.</p>
        <form action={saveSocialPeriod} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rede social"><select name="platform" className="input">{Object.entries(PLATFORMS).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></Field>
            <Field label="Mês"><input name="month" type="month" className="input" defaultValue={month} required/></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['reach','Alcance'],['impressions','Impressões'],['engagements','Interações'],
              ['profile_visits','Visitas ao perfil'],['link_clicks','Cliques no link'],['followers','Seguidores ao final do mês'],
            ].map(([key,label])=><Field key={key} label={label}>
              <input name={key} inputMode="numeric" type="number" min={0} step={1} placeholder={key==='followers'?'Não informado':'0'} className="input"/>
            </Field>)}
          </div>
          <SubmitButton className="btn btn-primary w-full" pendingText="Salvando…">Salvar métricas verificadas</SubmitButton>
        </form>
      </section>
      <section className="card">
        <h2 className="text-lg font-semibold">Registrar desempenho de um post</h2>
        <p className="mb-5 mt-1 text-xs text-muted">Publicações com dados confiáveis são exibidas no resumo. Facebook pode disponibilizar visualizações únicas em vez de alcance.</p>
        <form action={saveSocialPost} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rede"><select name="platform" className="input">{Object.entries(PLATFORMS).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></Field>
            <Field label="Data da publicação"><input name="published_on" type="date" defaultValue={todayBR()} required className="input"/></Field>
          </div>
          <Field label="Identificação do post"><input name="post_title" required minLength={3} maxLength={220} className="input" placeholder="Ex.: Por que um site bonito não basta"/></Field>
          <Field label="Link público (opcional)"><input name="post_url" type="url" className="input" placeholder="https://www.instagram.com/p/..."/></Field>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['reach','Alcance'],['views','Visualizações'],['interactions','Interações'],
              ['likes','Curtidas'],['comments','Comentários'],['shares','Compartilhamentos'],['saves','Salvamentos'],
            ].map(([key,label])=><Field key={key} label={label}><input type="number" inputMode="numeric" step={1} min={0} name={key} className="input" placeholder="0"/></Field>)}
          </div>
          <SubmitButton className="btn btn-dark w-full" pendingText="Salvando…">Adicionar post</SubmitButton>
        </form>
      </section>
    </div>
    <section className="card mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Publicações registradas</h2><p className="text-xs text-muted">Mais recentes primeiro</p></div>
      {posts?.length?<ul className="divide-y divide-line">{posts.map((p:any)=><li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{p.post_url?<a href={p.post_url} target="_blank" rel="noopener noreferrer" className="underline">{p.post_title}</a>:p.post_title}</div>
          <p className="mt-1 text-xs text-muted">{PLATFORMS[p.platform as keyof typeof PLATFORMS]??p.platform} · {dateBR(p.published_on)} · Alcance {formatNumber(p.reach)} · Interações {formatNumber(p.interactions)}</p>
        </div>
        <form action={deleteSocialPost.bind(null,p.id)}><button type="submit" className="btn btn-sm">Excluir</button></form>
      </li>)}</ul>:<p className="text-sm text-muted">Nenhum post com métricas registrado. Adicione um post para começar.</p>}
    </section>
  </>;
}
