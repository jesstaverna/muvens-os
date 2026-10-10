import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Tabs, Field, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { CopyButton } from '@/components/ClientButtons';
import { BrandUploader } from '../BrandUploader';
import { addColor, addFont, addLink, deleteAsset, removeColor, removeFont, removeLink, saveBrandProfile, updateAsset } from '../actions';
import { ASSET_CATEGORY, COLOR_ROLE, FONT_USAGE, IMAGE_EXT, extOf, knowledgeText } from '@/lib/brand';

export default async function BrandClient({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; cat?: string; q?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sp = await searchParams;
  const tab = ['marca', 'arquivos', 'regras', 'conhecimento'].includes(sp.tab ?? '') ? sp.tab! : 'marca';
  const { supabase, profile } = await requireModule('brand');
  const canWrite = ['admin', 'comercial', 'designer'].includes(profile.role);
  const isAdmin = profile.role === 'admin';
  const { data: client } = await supabase.from('clients').select('id, name, segment').eq('id', id).maybeSingle();
  if (!client) notFound();
  const base = `/brand/${id}`;
  const [{ data: bp }, { data: colors }, { data: fonts }, { data: links }] = await Promise.all([
    supabase.from('brand_profiles').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('brand_colors').select('*').eq('client_id', id).order('position'),
    supabase.from('brand_fonts').select('*').eq('client_id', id).order('position'),
    supabase.from('brand_links').select('*').eq('client_id', id),
  ]);

  let assets: any[] = [], thumbs = new Map<string, string>();
  if (tab === 'arquivos') {
    const term = (sp.q ?? '').replace(/[%,()]/g, ' ').trim();
    let aq = supabase.from('brand_assets').select('*').eq('client_id', id).order('created_at', { ascending: false });
    if (sp.cat && sp.cat in ASSET_CATEGORY) aq = aq.eq('category', sp.cat);
    if (term) aq = aq.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    assets = (await aq).data ?? [];
    const previewable = assets.filter((a) => IMAGE_EXT.includes(extOf(a.path)) && (a.downloadable || isAdmin));
    if (previewable.length) {
      const { data } = await supabase.storage.from('brand-assets').createSignedUrls(previewable.map((a) => a.path), 600);
      data?.forEach((d, i) => d.signedUrl && thumbs.set(previewable[i].id, d.signedUrl));
    }
  }
  let knowledge = '';
  if (tab === 'conhecimento') { const { data } = await supabase.rpc('brand_knowledge', { p_client: id }); knowledge = knowledgeText((data ?? {}) as Record<string, unknown>); }

  return (
    <>
      <PageHeader title={client.name} subtitle={`Brand Center${client.segment ? ' · ' + client.segment : ''}`} actions={<><Link href="/brand" className="btn btn-sm">← Marcas</Link><Link href={`/clientes/${id}`} className="btn btn-sm">Ver cliente</Link></>} />
      <Tabs current={tab} items={[{ key: 'marca', label: 'Paleta, fontes e links', href: base }, { key: 'arquivos', label: 'Arquivos', href: `${base}?tab=arquivos` }, { key: 'regras', label: 'Regras e tom de voz', href: `${base}?tab=regras` }, { key: 'conhecimento', label: 'Base de conhecimento (IA)', href: `${base}?tab=conhecimento` }]} />

      {tab === 'marca' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <section className="card xl:col-span-2"><h2 className="mb-4 text-base font-semibold">Paleta de cores</h2>
            {!colors?.length ? <p className="text-sm text-muted">Nenhuma cor cadastrada.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{colors.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl border border-line"><div className="h-20" style={{ background: c.hex }} /><div className="flex items-start justify-between gap-2 p-3 text-sm"><div><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.hex} · {COLOR_ROLE[c.role]}</div></div>
                {canWrite && <form action={removeColor.bind(null, id, c.id)}><button className="text-xs text-muted hover:text-danger" aria-label={`Remover ${c.name}`}>remover</button></form>}</div></div>))}</div>}
            {canWrite && <form action={addColor.bind(null, id)} className="mt-5 grid items-end gap-3 border-t border-line pt-5 sm:grid-cols-[1fr_9rem_9rem_auto]"><Field label="Nome"><input name="name" required className="input" /></Field><Field label="Cor (#RRGGBB)"><input name="hex" required placeholder="#DCEA1E" className="input" /></Field>
              <Field label="Função"><select name="role" className="input">{Object.entries(COLOR_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><SubmitButton className="btn btn-dark" pendingText="…">Adicionar</SubmitButton></form>}</section>

          <div className="space-y-6">
            <section className="card"><h2 className="mb-4 text-base font-semibold">Tipografia</h2>
              <ul className="mb-4 space-y-2 text-sm">{fonts?.map((f) => (<li key={f.id} className="flex justify-between gap-2"><span><b>{f.name}</b> <span className="text-muted">· {FONT_USAGE[f.usage]}</span>{f.source_url && <> · <a className="underline" href={f.source_url} target="_blank" rel="noreferrer noopener">fonte</a></>}</span>{canWrite && <form action={removeFont.bind(null, id, f.id)}><button className="text-xs text-muted hover:text-danger">remover</button></form>}</li>))}{!fonts?.length && <li className="text-muted">Nenhuma fonte.</li>}</ul>
              {canWrite && <form action={addFont.bind(null, id)} className="space-y-3"><Field label="Fonte"><input name="name" required className="input" /></Field><div className="grid grid-cols-2 gap-2"><Field label="Uso"><select name="usage" className="input">{Object.entries(FONT_USAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="Link (opcional)"><input name="source_url" className="input" placeholder="https://" /></Field></div><SubmitButton className="btn btn-sm" pendingText="…">Adicionar fonte</SubmitButton></form>}</section>
            <section className="card"><h2 className="mb-4 text-base font-semibold">Links (Figma, Drive…)</h2>
              <ul className="mb-4 space-y-2 text-sm">{links?.map((l) => (<li key={l.id} className="flex justify-between gap-2"><a className="truncate underline" href={l.url} target="_blank" rel="noreferrer noopener">{l.label} <span className="text-muted">({l.kind})</span></a>{canWrite && <form action={removeLink.bind(null, id, l.id)}><button className="text-xs text-muted hover:text-danger">remover</button></form>}</li>))}{!links?.length && <li className="text-muted">Nenhum link.</li>}</ul>
              {canWrite && <form action={addLink.bind(null, id)} className="space-y-3"><div className="grid grid-cols-[7rem_1fr] gap-2"><Field label="Tipo"><select name="kind" className="input"><option value="figma">Figma</option><option value="drive">Drive</option><option value="outro">Outro</option></select></Field><Field label="Nome"><input name="label" required className="input" /></Field></div><Field label="URL"><input name="url" required placeholder="https://" className="input" /></Field><SubmitButton className="btn btn-sm" pendingText="…">Adicionar link</SubmitButton></form>}</section>
          </div>
        </div>)}

      {tab === 'arquivos' && (
        <div className="space-y-6">
          <form method="get" className="flex flex-wrap gap-2"><input type="hidden" name="tab" value="arquivos" /><input name="q" defaultValue={sp.q} placeholder="Buscar neste cliente" className="input max-w-xs" aria-label="Buscar" />
            <select name="cat" defaultValue={sp.cat ?? ''} className="input w-52" aria-label="Categoria"><option value="">Todas as categorias</option>{Object.entries(ASSET_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn-dark">Filtrar</button></form>
          {canWrite && <BrandUploader clientId={id} />}
          {!assets.length ? <Empty title="Nenhum arquivo" text="Envie logos, variações, KV, brandbooks, fotos, templates e arquivos editáveis." /> : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{assets.map((a) => (
              <article key={a.id} className="card !p-0 overflow-hidden"><div className="grid h-40 place-items-center bg-subtle">{thumbs.has(a.id) ? <img src={thumbs.get(a.id)} alt={a.name} className="max-h-full max-w-full object-contain" loading="lazy" /> : <span className="text-xs uppercase tracking-wider text-muted">{extOf(a.path)}</span>}</div>
                <div className="space-y-2 p-4 text-sm"><div className="flex items-start justify-between gap-2"><div className="font-medium">{a.name}</div><span className="badge shrink-0">{ASSET_CATEGORY[a.category]}</span></div>
                  {a.description && <p className="text-xs text-muted">{a.description}</p>}{!!a.tags.length && <p className="text-xs text-muted">#{a.tags.join(' #')}</p>}
                  <div className="flex items-center gap-2">{a.downloadable || isAdmin ? <a className="btn btn-sm" href={`${base}/arquivo?f=${a.id}`}>Baixar</a> : <span className="text-xs text-muted">Download restrito ao administrador</span>}{!a.downloadable && <span className="badge">restrito</span>}</div>
                  {canWrite && <details className="text-xs"><summary className="cursor-pointer text-muted">Editar</summary>
                    <form action={updateAsset.bind(null, id, a.id)} className="mt-3 space-y-2"><input name="name" defaultValue={a.name} className="input" aria-label="Nome" /><select name="category" defaultValue={a.category} className="input" aria-label="Categoria">{Object.entries(ASSET_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <input name="description" defaultValue={a.description ?? ''} placeholder="Descrição" className="input" /><input name="tags" defaultValue={a.tags.join(', ')} placeholder="tags" className="input" /><label className="flex items-center gap-2"><input type="checkbox" name="downloadable" defaultChecked={a.downloadable} /> Download liberado</label><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form>
                    <form action={deleteAsset.bind(null, id, a.id)} className="mt-2"><SubmitButton className="btn btn-sm text-danger" pendingText="…" confirm="Excluir este arquivo definitivamente?">Excluir</SubmitButton></form></details>}</div></article>))}</div>)}
        </div>)}

      {tab === 'regras' && (
        <form action={saveBrandProfile.bind(null, id)} className="card max-w-3xl space-y-5"><fieldset disabled={!canWrite} className="space-y-5">
          <Field label="Tom de voz" hint="Como a marca fala: vocabulário, formalidade, o que evitar."><textarea name="tone_of_voice" rows={4} defaultValue={bp?.tone_of_voice ?? ''} className="input" /></Field>
          <Field label="Regras de design"><textarea name="design_rules" rows={5} defaultValue={bp?.design_rules ?? ''} className="input" placeholder="Grid, espaçamentos, uso de cores, estilo de imagem…" /></Field>
          <Field label="Restrições de aplicação" hint="O que NÃO fazer (ex.: não aplicar o logo sobre fundo escuro sem a versão negativa)."><textarea name="restrictions" rows={4} defaultValue={bp?.restrictions ?? ''} className="input" /></Field>
          <Field label="Instruções específicas para a IA" hint="Orientações para briefings e rascunhos gerados pela IA (Fase 4): diferenciais, termos proibidos, públicos."><textarea name="ai_instructions" rows={4} defaultValue={bp?.ai_instructions ?? ''} className="input" /></Field></fieldset>
          {canWrite ? <SubmitButton>Salvar regras</SubmitButton> : <p className="text-sm text-muted">Seu perfil tem acesso somente leitura.</p>}</form>)}

      {tab === 'conhecimento' && (
        <div className="max-w-3xl space-y-4"><div className="card text-sm"><b>Base de conhecimento da marca.</b> Reúne tom de voz, regras, restrições, instruções, paleta, fontes, links e inventário de arquivos. A IA da Fase 4 vai consultar exatamente este conteúdo (respeitando as permissões do usuário) para ajudar nos briefings. <b>Ainda não há IA conectada</b> — por enquanto você pode copiar o texto abaixo para usar em briefings.</div>
          <div className="flex justify-end"><CopyButton text={knowledge} label="Copiar texto" /></div>
          <pre className="card whitespace-pre-wrap font-mono text-xs leading-relaxed">{knowledge}</pre></div>)}
    </>
  );
}
