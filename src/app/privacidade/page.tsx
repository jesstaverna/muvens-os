import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Política de Privacidade — Muvens Agência', description: 'Como a Muvens Agência coleta, usa e protege dados pessoais (LGPD).' };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-10 text-xl font-semibold tracking-tight">{children}</h2>;
const L = ({ items }: { items: string[] }) => <ul className="mt-3 list-disc space-y-1.5 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>;

/** Política de privacidade pública. Usa os dados da empresa cadastrados em Prospecção > Configurações de envio (razão social, CNPJ, endereço, e-mail). */
export default async function Privacidade() {
  let s: { company_legal_name: string | null; company_document: string | null; company_address: string | null; reply_to: string | null; sender_email: string | null } | null = null;
  try { s = (await createAdminClient().from('outreach_settings').select('company_legal_name, company_document, company_address, reply_to, sender_email').eq('id', 1).maybeSingle()).data; } catch { /* sem configuração: usa texto padrão */ }
  const nome = s?.company_legal_name || 'Muvens Agência';
  const email = (s?.reply_to?.match(/<([^>]+)>/)?.[1] ?? s?.reply_to) || s?.sender_email || process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'o e-mail pelo qual você recebeu nossa mensagem';
  return (
    <div className="min-h-screen bg-[#F7F7F4] text-neutral-900" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="bg-black text-white"><div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-5"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span></div></header>
      <main className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed text-neutral-800">
        <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-neutral-500">Última atualização: 13 de outubro de 2026</p>
        <p className="mt-6">Esta política explica como a <strong>{nome}</strong> trata dados pessoais ao se relacionar com empresas e pessoas interessadas em nossos serviços de design, marketing digital e tecnologia, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).</p>

        <H>1. Quem é o controlador dos dados</H>
        <p className="mt-3"><strong>{nome}</strong>{s?.company_document ? `, CNPJ ${s.company_document}` : ''}{s?.company_address ? `, ${s.company_address}` : ''}. Contato para assuntos de privacidade: <strong>{email}</strong>.</p>

        <H>2. Quais dados coletamos</H>
        <L items={[
          'Dados informados por você em formulários de anúncios (Instagram e Facebook), páginas de contato e formulários de qualificação: nome, e-mail, telefone/WhatsApp, empresa, site, perfil em redes sociais e respostas sobre suas necessidades e dificuldades.',
          'Dados comerciais públicos de empresas, obtidos de fontes públicas (por exemplo, Google Maps e o site da própria empresa): nome da empresa, segmento, endereço, telefone, site, e-mails comerciais publicados, redes sociais e informações de presença digital.',
          'Registros de contato conosco: mensagens trocadas, aberturas do diagnóstico que enviamos e histórico de atendimento.',
        ]} />

        <H>3. Para que usamos os dados</H>
        <L items={[
          'Entrar em contato por e-mail e WhatsApp para responder ao seu pedido e enviar o diagnóstico da presença digital da sua empresa.',
          'Entender suas necessidades e preparar propostas de serviços.',
          'Prospecção comercial entre empresas (B2B), com identificação do remetente e opção de não receber mais mensagens a qualquer momento.',
          'Gerir o relacionamento com clientes e interessados e cumprir obrigações legais e contratuais.',
        ]} />

        <H>4. Bases legais</H>
        <L items={[
          'Consentimento (art. 7º, I): quando você preenche um formulário e concorda em ser contatado.',
          'Legítimo interesse (art. 7º, IX): para contatos comerciais com empresas, usando dados comerciais públicos, de forma proporcional e com opção de oposição.',
          'Execução de contrato e procedimentos preliminares (art. 7º, V): para elaborar propostas e prestar os serviços contratados.',
          'Cumprimento de obrigação legal ou regulatória (art. 7º, II), quando aplicável.',
        ]} />

        <H>5. Com quem compartilhamos</H>
        <p className="mt-3">Não vendemos dados pessoais. Usamos fornecedores que tratam dados em nosso nome, apenas para operar o serviço, como: hospedagem e banco de dados, envio de e-mails, ferramentas de automação e integração, e as plataformas de anúncios por meio das quais você nos contatou (Meta). Alguns desses fornecedores podem armazenar dados em servidores fora do Brasil; nesses casos, adotamos as salvaguardas previstas na LGPD. Também podemos compartilhar dados quando a lei ou uma autoridade exigir.</p>

        <H>6. Por quanto tempo guardamos</H>
        <p className="mt-3">Mantemos os dados pelo tempo necessário para cumprir as finalidades acima e as obrigações legais. Se você pedir a exclusão ou o descadastro, deixamos de contatá-lo e eliminamos ou anonimizamos os dados, exceto quando precisarmos guardá-los por obrigação legal ou para registrar o seu pedido de não contato.</p>

        <H>7. Seus direitos</H>
        <p className="mt-3">Nos termos do art. 18 da LGPD, você pode solicitar: confirmação de que tratamos seus dados e acesso a eles; correção de dados incompletos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade; portabilidade; informação sobre compartilhamentos; revogação do consentimento; e oposição a tratamentos baseados em legítimo interesse. Para exercer esses direitos, escreva para <strong>{email}</strong>. Nas mensagens comerciais, há também um link para não receber mais contatos.</p>

        <H>8. Segurança</H>
        <p className="mt-3">Adotamos medidas técnicas e organizacionais para proteger os dados, como controle de acesso por perfil, conexão criptografada, registro de alterações e limitação de acesso às pessoas que precisam deles. Nenhum sistema é totalmente imune a falhas; em caso de incidente relevante, comunicaremos os titulares e a autoridade competente conforme a lei.</p>

        <H>9. Cookies</H>
        <p className="mt-3">As páginas públicas de diagnóstico e de qualificação não usam cookies de publicidade ou rastreamento. A área logada da equipe usa apenas cookies essenciais de autenticação.</p>

        <H>10. Alterações desta política</H>
        <p className="mt-3">Podemos atualizar esta política. A data da última atualização fica no topo desta página.</p>

        <p className="mt-10 border-t border-neutral-300 pt-4 text-sm text-neutral-500">Dúvidas? Escreva para {email}.</p>
      </main>
    </div>
  );
}
