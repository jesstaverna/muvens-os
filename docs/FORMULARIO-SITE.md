# Formulário do site → CRM

`POST https://muvens-os.vercel.app/api/public/lead` (JSON). Sem segredo no navegador; protegido por origem (CORS), honeypot, tempo mínimo e limite por IP.

Campos: `nome, email, telefone, empresa, site, instagram, aceite (true), t (ms desde que a página abriu), hp (deve ficar vazio), utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_url`.

Resposta: `{ ok, duplicate, diagnosis: 'pending'|'none', token?, status_url? }`.
Se `pending`, consultar `GET /api/public/diagnostico?token=...` até `{ ready: true, url }`.

Origem do lead vem das UTMs (ex.: instagram + paid_social → "Instagram Ads"). Domínios extras: variável `PUBLIC_FORM_ORIGINS`.
