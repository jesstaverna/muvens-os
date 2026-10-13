# Leads de anúncios (Instagram/Facebook Ads) no MUVENS OS

Fluxo: lead preenche o formulário do anúncio → webhook → **lead no CRM** + **prospecto** (análise do site e diagnóstico, se informou o site) + **link de qualificação** + **rascunhos** de e-mail e WhatsApp (nada é enviado sem aprovação) → o lead responde às perguntas → o sistema pontua (quente, morno, frio), avisa a equipe e sugere a proposta.

## 1. Configuração (uma vez)
1. Rode no Supabase o arquivo `supabase/atualizacoes/J_leads_anuncios.sql` (migração 18).
2. Na Vercel, cadastre `LEADS_WEBHOOK_SECRET` (texto longo e aleatório, ex.: `openssl rand -hex 32`) e faça Redeploy.
3. Endereço do webhook: `https://SEU-DOMINIO/api/leads/webhook` (POST, JSON). Envie o segredo no cabeçalho `x-webhook-secret` (ou `Authorization: Bearer <segredo>`).

## 2. Ligar o Meta Lead Ads
Use uma ferramenta de integração (Make, Zapier ou n8n): gatilho **Facebook Lead Ads — New Lead**; ação **HTTP — POST** para o endereço acima, com o cabeçalho do segredo e o corpo JSON com os campos do lead.
Campos aceitos (português ou inglês): `nome`/`full_name`, `email`, `telefone`/`phone_number`, `empresa`/`company_name`, `site`/`website`, `instagram`, `mensagem`; também `campaign_name`, `ad_name` e `platform` (ig/fb). O formato `field_data` do Meta é aceito como está.
**Inclua no formulário do anúncio o campo "site da empresa"**: com ele o sistema gera o diagnóstico.

## 3. O que acontece com cada lead
- Cria o lead no CRM com a origem (Instagram Ads / Facebook Ads) e uma nota com campanha/anúncio. E-mail ou telefone repetido não duplica: registra a nova interação no lead existente.
- Cria o prospecto; com site, ele é analisado em segundo plano (e o diagnóstico fica disponível).
- Cria o link de qualificação (`/qualificar/<token>`) e os **rascunhos** de e-mail e WhatsApp assistido (Prospecção > Fila de e-mails; revise e aprove).
- Quando o lead responde: pontuação por prazo, quem decide, investimento, áreas e profundidade das respostas; notificação para a equipe; `próxima ação` do lead atualizada; botão **Proposta de <serviço>** no CRM (só para leads quentes/mornos).
- Lead de anúncio não entra na aprovação automática nem recebe follow-up de abordagem fria.

## 4. Testar
```
curl -X POST https://SEU-DOMINIO/api/leads/webhook \
  -H "content-type: application/json" -H "x-webhook-secret: SEU_SEGREDO" \
  -d '{"nome":"Teste","email":"teste@exemplo.com","telefone":"(41) 99999-0000","empresa":"Empresa Teste","site":"empresa.com.br","source":"Instagram Ads"}'
```
Resposta esperada: `{"ok":true,"duplicate":false,"lead_id":"..."}`.

## Limites
- Integração direta com a API do Meta (sem Make/Zapier) não foi construída: exige app no Meta for Developers e revisão de permissões.
- A pontuação é por regras simples, para triagem.
