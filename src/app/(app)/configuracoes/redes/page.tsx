import Link from 'next/link';
import { CalendarClock, CheckCircle2, Link2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { requireModule } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR } from '@/lib/format';
import { decryptSocialSecret, getMetaPages, providerIsConfigured } from '@/lib/social-auth';
import { disconnectSocialConnection, finishLinkedInConnection, finishMetaConnection, syncSocialConnectionNow } from './actions';

export const dynamic='force-dynamic';
export const metadata={title:'Conexões de Redes Sociais | MUVENS OS'};
const title:Record<string,string>={instagram:'Instagram',facebook:'Facebook',linkedin:'LinkedIn'};
type Pending={
  id:string; provider:'meta'|'linkedin'; token_ciphertext:string;created_by:string;expires_at:string;
};
type Connection={
  id:string;platform:string;display_name:string;remote_id:string;status:string;last_sync_at:string|null;last_error:string|null;
};
export default async function Redes({searchParams}:{searchParams:Promise<{pending?:string}>}){
  const {profile}=await requireModule('configuracoes');
  if(profile.role!=='admin')return <div className="card"><p className="text-sm text-muted">Somente administradores podem autorizar conexões de redes sociais.</p></div>;
  const q=await searchParams;
  const admin=createAdminClient();
  const {data:client}=await admin.from('clients').select('id').eq('name','MUVENS').maybeSingle();
  const [{data:conns,error:listError},{data:auth}]=await Promise.all([
    client?admin.from('social_connections').select('id,platform,display_name,remote_id,status,last_sync_at,last_error')
      .eq('client_id',client.id).order('platform'):Promise.resolve({data:[],error:null}),
    q.pending&&/^[a-f0-9-]{36}$/i.test(q.pending)
      ?admin.from('social_oauth_pending').select('*').eq('id',q.pending).eq('created_by',profile.id)
        .gt('expires_at',new Date().toISOString()).maybeSingle()
      :Promise.resolve({data:null,error:null}),
  ]);
  const pending=auth as Pending|null;
  let pages:Array<{id:string;name:string;instagram?:string}>=[];
  let pendingError:string|null=null;
  if(pending?.provider==='meta'){
    try{
      const parsed=JSON.parse(decryptSocialSecret(pending.token_ciphertext)) as {token:string};
      const options=await getMetaPages(parsed.token);
      pages=options.map(p=>({id:p.id,name:p.name,instagram:p.instagram_business_account?.username??(p.instagram_business_account?.id?'Conta profissional vinculada':undefined)}));
    }catch{
      pendingError='Não foi possível listar suas Páginas. Verifique a autorização de pages_show_list.';
    }
  }
  const connected=(conns??[]) as Connection[];
  return <>
    <PageHeader title="Integrações de redes sociais" subtitle="Conecte os perfis oficiais da MUVENS para importar resultados automaticamente."
      actions={<Link href="/configuracoes?tab=integracoes" className="btn">← Configurações</Link>}/>
    <div className="mb-6 rounded-2xl border border-[#DCEA1E]/40 bg-[#DCEA1E]/10 p-5 text-sm">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>
      <div><p className="font-semibold">Autorização somente leitura para indicadores</p>
        <p className="mt-1 leading-6 text-muted">Os tokens são cifrados e não aparecem no navegador. Antes de iniciar, configure os aplicativos em Meta for Developers e LinkedIn Developers e as variáveis privadas no servidor. Conexões só aparecem ativas depois da autorização.</p></div></div>
    </div>

    {pending?.provider==='meta'&&<section className="card mb-6">
      <h2 className="mb-2 text-lg font-semibold">Concluir conexão Meta</h2>
      <p className="mb-5 text-sm text-muted">Escolha especificamente a Página da MUVENS. O Instagram profissional precisa estar vinculado a ela; não conectaremos outras marcas da sua conta.</p>
      {pendingError?<p role="alert" className="mb-4 text-sm text-danger">{pendingError}</p>:null}
      {pages.length?<form action={finishMetaConnection} className="space-y-4">
        <input type="hidden" name="pending" value={pending.id}/>
        <Field label="Página do Facebook autorizada">
          <select name="page_id" className="input" required>
            <option value="">Selecione a Página</option>
            {pages.map(p=><option key={p.id} value={p.id}>{p.name}{p.instagram?' · Instagram: '+p.instagram:' · sem Instagram profissional'}</option>)}
          </select>
        </Field>
        <SubmitButton className="btn btn-primary" pendingText="Protegendo credenciais…">Conectar Página selecionada</SubmitButton>
      </form>:<p className="text-sm text-muted">Nenhuma Página disponível. Verifique se você tem acesso à Página da MUVENS e concedeu todas as permissões solicitadas.</p>}
    </section>}
    {pending?.provider==='linkedin'&&<section className="card mb-6">
      <h2 className="mb-2 text-lg font-semibold">Concluir conexão LinkedIn</h2>
      <p className="mb-4 text-sm text-muted">Informe o identificador numérico da Página empresarial que você administra. O sistema verificará o acesso às estatísticas antes de registrar a conexão.</p>
      <form action={finishLinkedInConnection} className="space-y-4">
        <input type="hidden" name="pending" value={pending.id}/>
        <Field label="ID numérico da organização">
          <input className="input" name="organization_id" required pattern="[0-9]{3,20}" placeholder="Ex.: 12345678"/>
        </Field>
        <Field label="Nome da Página">
          <input className="input" name="display_name" defaultValue="MUVENS" required maxLength={120}/>
        </Field>
        <SubmitButton className="btn btn-primary" pendingText="Validando acesso…">Conectar Página LinkedIn</SubmitButton>
      </form>
    </section>}
    <section className="mb-6 grid gap-4 lg:grid-cols-3">
      {[
        {platform:'meta',name:'Instagram + Facebook',description:'Autorize sua Página do Facebook e sua conta profissional vinculada.'},
        {platform:'linkedin',name:'LinkedIn',description:'Autorize analytics da Página empresarial da MUVENS.'},
      ].map((p)=>(
        <article key={p.platform} className="card lg:col-span-1">
          <h3 className="text-base font-semibold">{p.name}</h3>
          <p className="mb-5 mt-2 min-h-12 text-sm leading-6 text-muted">{p.description}</p>
          {providerIsConfigured(p.platform as 'meta'|'linkedin')
            ?<a href={'/api/social/oauth/'+p.platform+'/start'} className="btn btn-primary inline-flex w-full justify-center gap-2"><Link2 className="h-4 w-4"/> Autorizar com {p.platform==='meta'?'Meta':'LinkedIn'}</a>
            :<div className="rounded-xl border border-dashed border-line bg-subtle px-4 py-3 text-xs leading-5 text-muted">
              <TriangleAlert className="mb-2 h-4 w-4"/> Aplicativo ainda não configurado no servidor. Veja o guia de implantação.
            </div>}
        </article>
      ))}
    </section>
    <section className="card mb-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Contas vinculadas</h2>
        <span className="badge">{connected.length} conectada(s)</span>
      </div>
      {listError&&<p role="alert" className="text-sm text-danger">Não foi possível carregar as conexões.</p>}
      {connected.length?<div className="divide-y divide-line">{connected.map(c=><div key={c.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{title[c.platform]??c.platform}</span>
            {c.status==='connected'
              ?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5"/> Conectada</span>
              :<span className="badge">{c.status==='expired'?'Reautorizar':'Atenção'}</span>}
          </div>
          <div className="mt-1 text-sm">{c.display_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <CalendarClock className="h-3.5 w-3.5"/>
            {c.last_sync_at?'Última sincronização: '+dateTimeBR(c.last_sync_at):'Ainda não sincronizada'}
          </div>
          {c.last_error&&<p className="mt-2 max-w-xl text-xs leading-5 text-muted">{c.last_error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={syncSocialConnectionNow.bind(null,c.id)}>
            <SubmitButton className="btn btn-sm" pendingText="Sincronizando…"><RefreshCw className="h-3.5 w-3.5"/> Sincronizar</SubmitButton>
          </form>
          <form action={disconnectSocialConnection.bind(null,c.id)}>
            <SubmitButton className="btn btn-sm" pendingText="Desconectando…">Desconectar</SubmitButton>
          </form>
        </div>
      </div>)}</div>:<p className="py-6 text-sm leading-6 text-muted">Nenhuma conta autorizada ainda. Configure os aplicativos oficiais para habilitar os botões de conexão.</p>}
    </section>
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">Próximos passos</h2>
      <p className="mt-2 text-sm leading-6 text-muted">Depois de autorizar a rede, use “Sincronizar” para testar a primeira coleta. A atualização diária será executada pelo agendador, quando o projeto estiver implantado com CRON_SECRET. Os resultados aparecem em <Link href="/social-insights" className="underline">Desempenho das Redes</Link> e <Link href="/inicio" className="underline">Início</Link>.</p>
    </section>
  </>;
}
