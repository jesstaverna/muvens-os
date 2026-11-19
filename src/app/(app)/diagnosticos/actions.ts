'use server';
import { randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireModule, flash } from '@/lib/session';
import { AREA_KEYS, reportSchema, clientMessage, type DiagnosticArea } from '@/lib/diagnostics';
import { analyzeDigitalDiagnostic } from '@/lib/diagnostics-analyzer';
import { normalizeUrl } from '@/integrations/net-safe';
import { appUrl, isValidAppUrl } from '@/lib/app-url';

const ROOT = '/diagnosticos';
const uuid = z.string().uuid();
const allowedMime = ['image/png','image/jpeg','image/webp'] as const;
const getText = (fd: FormData, name: string) => String(fd.get(name) ?? '').trim();
const back = (id: string) => ROOT + '/' + id;
const splitLines = (value: string, max: number) =>
  value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0,max);

async function recordFor(id: string) {
  if (!uuid.safeParse(id).success) flash(ROOT,'err','Diagnóstico inválido.');
  const { supabase } = await requireModule('diagnosticos');
  const { data, error } = await supabase.from('digital_diagnostics').select('*').eq('id',id).maybeSingle();
  if (error || !data) flash(ROOT,'err','Diagnóstico não encontrado ou indisponível.');
  return { supabase, record: data! };
}

export async function createDiagnostic(fd: FormData) {
  const { supabase } = await requireModule('diagnosticos');
  const company_name = getText(fd,'company_name');
  const contact_name = getText(fd,'contact_name') || null;
  const context = getText(fd,'context') || null;
  const scopes = [...new Set(fd.getAll('scopes').map(String))]
    .filter((scope): scope is DiagnosticArea => AREA_KEYS.includes(scope as DiagnosticArea));
  if (company_name.length < 2 || company_name.length > 180 || scopes.length < 1) {
    flash(ROOT,'err','Informe a empresa e selecione pelo menos uma área de diagnóstico.');
  }
  const links: Record<string,string> = {};
  for (const scope of scopes) {
    const raw = getText(fd,'link_' + scope);
    if (!raw) continue;
    const url = normalizeUrl(raw);
    if (!url || !['http:','https:'].includes(url.protocol) || !!url.username || !!url.password) {
      flash(ROOT,'err','URL inválida para ' + scope + '.');
    }
    links[scope] = url!.toString();
  }
  const { data, error } = await supabase.from('digital_diagnostics')
    .insert({ company_name, contact_name, context, scopes, links }).select('id').single();
  if (error || !data) flash(ROOT,'err','Não foi possível criar o diagnóstico. Verifique a migração e suas permissões.');
  revalidatePath(ROOT);
  flash(back(data!.id),'ok','Diagnóstico criado. Envie prints, analise e revise antes de publicar.');
}

export async function analyzeDiagnostic(id: string) {
  const { supabase,record } = await recordFor(id);
  const { data: assets } = await supabase.from('digital_diagnostic_assets')
    .select('scope,file_name,storage_path,mime,size_bytes').eq('report_id',id).order('created_at');
  let report;
  try {
    report = await analyzeDigitalDiagnostic(supabase, {
      company_name:record.company_name,
      scopes:record.scopes as DiagnosticArea[],
      links:(record.links ?? {}) as Record<string,string>,
      context:record.context,
    }, (assets ?? []) as Array<{ scope:DiagnosticArea;file_name:string;storage_path:string;mime:string;size_bytes:number }>);
  } catch (e) {
    flash(back(id),'err', e instanceof Error ? e.message : 'Falha na análise.');
  }
  const { error } = await supabase.from('digital_diagnostics')
    .update({ report, summary:report!.executive_summary, status:'analisado',
      analyzed_at:new Date().toISOString(), published_at:null, report_token:null, message:null })
    .eq('id',id);
  if (error) flash(back(id),'err','Não foi possível salvar o resultado da IA.');
  revalidatePath(back(id));
  flash(back(id),'ok','Análise gerada. Revise e salve o relatório antes de publicar.');
}

export async function saveDiagnosticReport(id: string, fd: FormData) {
  const { supabase,record } = await recordFor(id);
  const current = reportSchema.safeParse(record.report);
  if (!current.success) flash(back(id),'err','Gere uma análise antes de editar.');
  const report = {
    headline: getText(fd,'headline'),
    executive_summary: getText(fd,'executive_summary'),
    sections: current.data.sections.map(section => ({
      area:section.area,
      strengths:splitLines(getText(fd,'strengths_' + section.area),7),
      limitations:splitLines(getText(fd,'limitations_' + section.area),6),
      findings:section.findings.map((item,index) => {
        const prefix = 'f_' + section.area + '_' + index + '_';
        return {
          title:getText(fd,prefix + 'title'),
          evidence:getText(fd,prefix + 'evidence'),
          impact:getText(fd,prefix + 'impact'),
          recommendation:getText(fd,prefix + 'recommendation'),
          priority:getText(fd,prefix + 'priority') || item.priority,
        };
      }).filter(item => item.title),
    })),
    next_steps:splitLines(getText(fd,'next_steps'),8),
  };
  const validated = reportSchema.safeParse(report);
  if (!validated.success) flash(back(id),'err','Confira os textos. Títulos, evidências e recomendações não podem ficar vazios.');
  const {error} = await supabase.from('digital_diagnostics')
    .update({report:validated.data,summary:validated.data.executive_summary,status:'analisado',published_at:null,report_token:null,message:null})
    .eq('id',id);
  if (error) flash(back(id),'err','Não foi possível salvar as alterações.');
  revalidatePath(back(id));
  flash(back(id),'ok','Revisão salva. Você já pode publicar.');
}

export async function publishDiagnostic(id: string) {
  const { supabase,record } = await recordFor(id);
  const parsed = reportSchema.safeParse(record.report);
  if (!parsed.success) flash(back(id),'err','Revise ou gere o conteúdo antes de publicar.');
  const origin = appUrl();
  if (!isValidAppUrl(origin)) flash(back(id),'err','Configure NEXT_PUBLIC_APP_URL para publicar links.');
  const token = record.status === 'publicado' && record.report_token
    ? record.report_token as string : randomBytes(32).toString('hex');
  const url = origin + '/relatorio-digital/' + token;
  const message = clientMessage(record.company_name,record.contact_name,url);
  const {error} = await supabase.from('digital_diagnostics')
    .update({status:'publicado',report_token:token,published_at:new Date().toISOString(),message}).eq('id',id);
  if (error) flash(back(id),'err','Não foi possível publicar o diagnóstico.');
  revalidatePath(back(id));
  flash(back(id),'ok','Relatório publicado. Copie a mensagem e o link para enviar.');
}

export async function unpublishDiagnostic(id: string) {
  const {supabase} = await recordFor(id);
  const {error} = await supabase.from('digital_diagnostics')
    .update({status:'analisado',report_token:null,published_at:null,message:null}).eq('id',id);
  if (error) flash(back(id),'err','Não foi possível retirar o relatório do ar.');
  revalidatePath(back(id));
  flash(back(id),'ok','Link desativado.');
}

export async function prepareDiagnosticUpload(id: string, scope: DiagnosticArea, fileName: string, size: number, mime: string):
  Promise<{path:string;token:string}|{error:string}> {
  const {supabase,record} = await recordFor(id);
  if (!record.scopes.includes(scope)) return {error:'Área não selecionada neste diagnóstico.'};
  if (!allowedMime.includes(mime as typeof allowedMime[number]) || size <= 0 || size > 5 * 1024 * 1024) {
    return {error:'Envie PNG, JPG ou WebP com até 5 MB.'};
  }
  const path = id + '/' + randomUUID() + '-' + fileName.replace(/[^a-z0-9_.-]/gi,'_').slice(-65);
  const {data,error} = await supabase.storage.from('diagnostic-evidence').createSignedUploadUrl(path);
  if (error || !data) return {error:'Não foi possível preparar o envio. Confira o bucket privado.'};
  return {path,token:data.token};
}

export async function registerDiagnosticUpload(id: string, input:{
  scope:DiagnosticArea;path:string;name:string;size:number;mime:string
}):Promise<string|null> {
  const {supabase,record} = await recordFor(id);
  if (!record.scopes.includes(input.scope) || !input.path.startsWith(id + '/')
    || !allowedMime.includes(input.mime as typeof allowedMime[number]) || input.size > 5 * 1024 * 1024) {
    return 'Arquivo inválido.';
  }
  const {error} = await supabase.from('digital_diagnostic_assets')
    .insert({report_id:id,scope:input.scope,storage_path:input.path,
      file_name:input.name.slice(0,180),mime:input.mime,size_bytes:input.size});
  if (error) return 'Não foi possível registrar o print.';
  revalidatePath(back(id));
  return null;
}

export async function deleteDiagnosticUpload(id: string,assetId: string) {
  const {supabase} = await recordFor(id);
  if (!uuid.safeParse(assetId).success) flash(back(id),'err','Arquivo inválido.');
  const {data} = await supabase.from('digital_diagnostic_assets')
    .select('storage_path').eq('id',assetId).eq('report_id',id).maybeSingle();
  if (!data) flash(back(id),'err','Arquivo não encontrado.');
  const {error:removeError} = await supabase.storage.from('diagnostic-evidence').remove([data!.storage_path]);
  if (removeError) flash(back(id),'err','Não foi possível remover o print.');
  const {error} = await supabase.from('digital_diagnostic_assets').delete().eq('id',assetId).eq('report_id',id);
  if (error) flash(back(id),'err','Não foi possível excluir o registro do print.');
  revalidatePath(back(id));
  flash(back(id),'ok','Print removido. Refaça a análise se necessário.');
}
