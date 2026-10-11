import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { saveAgency, saveTemplate } from '../actions';
import { SERVICE_LABEL as LABEL } from '@/lib/proposal-templates';
import { LinkButton } from '@/components/LinkButton';

export const metadata = { title: 'Modelos de contrato' };
const VARS = ['servico', 'contratante_nome', 'contratante_documento', 'contratante_endereco', 'contratada_nome', 'contratada_documento', 'contratada_endereco', 'contratada_representante', 'escopo', 'entregaveis', 'prazo_execucao', 'valor_total', 'forma_pagamento', 'vigencia', 'reajuste', 'cidade', 'data'];

export default async function Modelos() {
  const { supabase, profile } = await requireModule('contratos');
  const isAdmin = profile.role === 'admin';
  const [{ data: tpls }, { data: a }] = await Promise.all([supabase.from('contract_templates').select('*').order('service_template'), supabase.from('agency_settings').select('*').eq('id', 1).single()]);
  const v = (x: unknown) => (x == null ? '' : String(x));
  return (
    <>
      <PageHeader title="Modelos de contrato" subtitle="Dados da Muvens (contratada) e um modelo por serviço." actions={<LinkButton href="/contratos" className="btn">← Contratos</LinkButton>} />
      <form action={saveAgency} className="card mb-8 space-y-5"><h2 className="text-base font-semibold">Dados da agência (contratada)</h2>
        <fieldset disabled={!isAdmin} className="grid gap-5 sm:grid-cols-2">
          <Field label="Razão social"><input name="legal_name" defaultValue={v(a?.legal_name)} className="input" /></Field><Field label="CNPJ"><input name="document" defaultValue={v(a?.document)} className="input" /></Field>
          <Field label="Endereço"><input name="address" defaultValue={v(a?.address)} className="input" /></Field><Field label="Cidade (para a data do contrato)"><input name="city" defaultValue={v(a?.city)} className="input" /></Field>
          <Field label="Representante legal"><input name="representative_name" defaultValue={v(a?.representative_name)} className="input" /></Field><Field label="Cargo do representante"><input name="representative_role" defaultValue={v(a?.representative_role)} className="input" /></Field>
          <Field label="E-mail"><input name="email" type="email" defaultValue={v(a?.email)} className="input" /></Field></fieldset>
        {isAdmin ? <SubmitButton>Salvar dados da agência</SubmitButton> : <p className="text-sm text-muted">Somente administradores editam.</p>}</form>
      <div className="card mb-6 text-sm"><b>Campos automáticos</b> (use <code>{'{{nome}}'}</code> no texto): {VARS.map((x) => <code key={x} className="mr-1.5">{`{{${x}}}`}</code>)}<p className="mt-2 text-muted">Campos sem dado viram <code>[PREENCHER: …]</code> e bloqueiam a aprovação até serem resolvidos. O modelo-base não é assessoria jurídica: peça revisão ao seu advogado.</p></div>
      <div className="space-y-4">{tpls?.map((t) => (
        <details key={t.id} className="card"><summary className="cursor-pointer text-sm font-medium">{LABEL[t.service_template]} — {t.name}{t.active ? '' : ' (inativo)'}</summary>
          <form action={saveTemplate.bind(null, t.id)} className="mt-5 space-y-4"><fieldset disabled={!isAdmin} className="space-y-4"><Field label="Nome"><input name="name" defaultValue={t.name} className="input" /></Field>
            <Field label="Texto"><textarea name="body" rows={22} defaultValue={t.body} className="input font-mono text-xs" /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={t.active} /> Ativo</label></fieldset>
            {isAdmin && <SubmitButton>Salvar modelo</SubmitButton>}</form></details>))}</div>
    </>
  );
}
