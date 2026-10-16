# Formulário do site → CRM

`POST https://muvens-os.vercel.app/api/public/lead` (JSON). Sem segredo no navegador; protegido por origem (CORS), honeypot, tempo mínimo e limite por IP.

Campos: `nome, email, telefone, empresa, site, instagram, aceite (true), t (ms desde que a página abriu), hp (deve ficar vazio), utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_url`.

Resposta: `{ ok, duplicate, diagnosis: 'pending'|'none', token?, status_url? }`.
Se `pending`, consultar `GET /api/public/diagnostico?token=...` até `{ ready: true, url }`.

Origem do lead vem das UTMs (ex.: instagram + paid_social → "Instagram Ads"). Domínios extras: variável `PUBLIC_FORM_ORIGINS`.

## Perguntas de qualificação (opcional, recomendado)
Envie junto, em `qualificacao`: `{ desafio, areas: [site_institucional|landing_page|redes_sociais|design_posts|branding|trafego_pago|rd_marketing|ia_aplicada|consultoria], prazo: agora|30dias|3meses|pesquisando, invest: nenhum|ate1k|1a5k|mais5k, decisor: sim|socio|nao, contato: whatsapp|email|ligacao }`.
O lead é pontuado (quente/morno/frio) antes do 1º contato, não recebe o convite de qualificação e a equipe recebe um único e-mail de alerta com as respostas. Resposta inválida → 400 com a mensagem.
No CRM, o lead aparece com a etiqueta "Diagnóstico gratuito".
