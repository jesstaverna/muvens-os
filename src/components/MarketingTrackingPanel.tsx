'use client';

import { useMemo, useState } from 'react';
import { Check, ClipboardCopy, ExternalLink, Link2, ShieldAlert } from 'lucide-react';
import { buildPaidSocialUrl, monthlyToDaily, type PaidSocialSource } from '@/lib/marketing-tracking';

export interface TrackableActivity {
  id: string;
  title: string;
  utm_campaign: string | null;
  status: string;
}

interface Props {
  landingUrl: string | null;
  campaigns: TrackableActivity[];
  creatives: TrackableActivity[];
  minimumBudget: number;
  maximumBudget: number;
}

const reais = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export function MarketingTrackingPanel({
  landingUrl, campaigns, creatives, minimumBudget, maximumBudget,
}: Props) {
  const [source, setSource] = useState<PaidSocialSource>('instagram');
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? '');
  const [creativeId, setCreativeId] = useState(creatives[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const campaign = campaigns.find((item) => item.id === campaignId) ?? campaigns[0];
  const creative = creatives.find((item) => item.id === creativeId) ?? creatives[0];
  const url = useMemo(
    () => buildPaidSocialUrl(
      landingUrl ?? '',
      source,
      campaign?.utm_campaign || campaign?.title || '',
      creative?.title || '',
    ),
    [landingUrl, source, campaign?.utm_campaign, campaign?.title, creative?.title],
  );

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  const mid = (Number(minimumBudget) + Number(maximumBudget)) / 2;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Orçamento ilustrativo">
        <div className="card !p-5">
          <div className="label">Mínimo mensal</div>
          <div className="text-2xl font-semibold">{reais(Number(minimumBudget))}</div>
          <p className="mt-1 text-xs text-muted">Média de {reais(monthlyToDaily(Number(minimumBudget)) ?? 0)} por dia (30 dias)</p>
        </div>
        <div className="card !p-5">
          <div className="label">Referência intermediária</div>
          <div className="text-2xl font-semibold">{reais(mid)}</div>
          <p className="mt-1 text-xs text-muted">Média de {reais(monthlyToDaily(mid) ?? 0)} por dia (30 dias)</p>
        </div>
        <div className="card !p-5">
          <div className="label">Teto mensal</div>
          <div className="text-2xl font-semibold">{reais(Number(maximumBudget))}</div>
          <p className="mt-1 text-xs text-muted">Média de {reais(monthlyToDaily(Number(maximumBudget)) ?? 0)} por dia (30 dias)</p>
        </div>
      </section>
      <p className="text-xs text-muted">
        Valores apenas de referência para planejamento. São médias sobre 30 dias, não configurações enviadas à Meta
        nem garantia de gasto ou retorno. Confirme orçamento, dias de veiculação e cobrança no Gerenciador de Anúncios.
      </p>
      <section className="card">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-black">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Gerador de links rastreáveis</h2>
            <p className="mt-1 text-sm text-muted">
              Gere uma URL distinta por plataforma e criativo, para inserir no anúncio.
              Copiar o link não conecta o formulário ao CRM automaticamente.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="label">Plataforma</span>
            <select
              className="input"
              value={source}
              onChange={(e) => { setSource(e.target.value as PaidSocialSource); setCopied(false); }}
            >
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Campanha</span>
            <select
              className="input"
              value={campaign?.id ?? ''}
              onChange={(e) => { setCampaignId(e.target.value); setCopied(false); }}
            >
              {campaigns.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="label">Criativo / variação</span>
            <select
              className="input"
              value={creative?.id ?? ''}
              onChange={(e) => { setCreativeId(e.target.value); setCopied(false); }}
            >
              {creatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        </div>
        {url
          ? <div className="mt-5 space-y-3">
            <label className="block">
              <span className="label">URL final com UTM</span>
              <textarea className="input min-h-[100px] font-mono text-xs" value={url} readOnly aria-label="URL com UTMs" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={copyUrl} className="btn btn-primary btn-sm">
                {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied ? 'Link copiado' : 'Copiar URL'}
              </button>
              <a href={url} rel="noopener noreferrer" target="_blank" className="btn btn-sm">
                <ExternalLink className="h-4 w-4" /> Conferir página
              </a>
            </div>
            {copyError && <p role="alert" className="text-xs text-danger">Não foi possível copiar automaticamente. Selecione a URL acima para copiar.</p>}
          </div>
          : <p className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-warn" role="alert">
            Não é possível montar a URL ainda. Cadastre um destino HTTPS, pelo menos uma campanha e um criativo com nome.
          </p>}
      </section>
      <section className="card">
        <div className="mb-4 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-muted" />
          <h2 className="text-base font-semibold">O que ainda precisa ser verificado</h2>
        </div>
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li><strong>Landing page:</strong> o formulário deve abrir, enviar e confirmar o pedido no celular e no desktop.</li>
          <li><strong>Meta Pixel:</strong> confirmar o evento de conversão adequado e sua chegada ao Gerenciador de Eventos; respeitar consentimento aplicável.</li>
          <li><strong>CRM:</strong> após o envio do formulário, registrar as UTMs junto ao lead real; validar um teste ponta a ponta antes de usar relatórios.</li>
          <li><strong>Qualificação:</strong> distinguir contato recebido de diagnóstico qualificado e de oportunidade comercial.</li>
          <li><strong>Conta de anúncios:</strong> conferir a configuração de campanha, limites e método de cobrança diretamente na Meta.</li>
        </ol>
        <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
          Esta tela prepara links e conferências; não publica anúncios, não instala Pixel e não transmite dados para a Meta.
        </p>
      </section>
    </div>
  );
}
