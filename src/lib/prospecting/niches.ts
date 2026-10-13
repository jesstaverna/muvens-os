import { slug } from './groups';

export interface NicheOption { label: string; q: string }           // q = termo enviado ao Google Maps
export interface NicheGroup { key: string; label: string; aliases: string[]; options: NicheOption[] }

const o = (label: string, q?: string): NicheOption => ({ label, q: q ?? label.toLowerCase() });

/** Catálogo de nichos para sugerir tipos ao digitar uma área ampla (ex.: "indústria" → metalúrgica, têxtil, alimentícia…). Editável. */
export const NICHE_GROUPS: NicheGroup[] = [
  { key: 'industria', label: 'Indústria', aliases: ['industria', 'industrial', 'fabrica', 'fabricas', 'manufatura'], options: [
    o('Metalúrgica e siderúrgica', 'metalúrgica'), o('Usinagem e caldeiraria', 'usinagem'), o('Têxtil e confecção', 'indústria têxtil'), o('Alimentícia', 'indústria de alimentos'), o('Alimentos pet (ração)', 'fábrica de ração para pet'), o('Laticínios', 'laticínios'), o('Panificação industrial', 'indústria de panificação'), o('Bebidas', 'indústria de bebidas'),
    o('Plásticos e embalagens', 'indústria de plásticos'), o('Química', 'indústria química'), o('Moveleira (fábrica de móveis)', 'fábrica de móveis'), o('Madeireira', 'madeireira'), o('Gráfica industrial', 'gráfica'),
    o('Autopeças', 'fábrica de autopeças'), o('Eletroeletrônica', 'indústria eletrônica'), o('Cosméticos e higiene', 'indústria de cosméticos'), o('Calçados', 'fábrica de calçados'),
    o('Materiais de construção', 'fábrica de materiais de construção'), o('Máquinas e equipamentos', 'fábrica de máquinas e equipamentos'), o('Farmacêutica', 'indústria farmacêutica'), o('Vidros e cerâmica', 'fábrica de vidros'), o('Reciclagem', 'reciclagem industrial'), o('Papel e embalagens de papel', 'indústria de papel'), o('Borracha e pneus', 'indústria de borracha'), o('Equipamentos médicos e hospitalares', 'fábrica de equipamentos médicos'), o('Produtos de limpeza', 'fábrica de produtos de limpeza')] },
  { key: 'saude', label: 'Saúde', aliases: ['saude', 'clinica', 'clinicas', 'medico', 'medica', 'hospital'], options: [
    o('Clínica odontológica'), o('Clínica de estética'), o('Clínica médica'), o('Clínica veterinária'), o('Fisioterapia'), o('Psicologia'), o('Laboratório de análises clínicas'), o('Óptica e oftalmologia', 'ótica'), o('Nutrição')] },
  { key: 'alimentacao', label: 'Alimentação', aliases: ['alimentacao', 'comida', 'gastronomia', 'food'], options: [
    o('Restaurante'), o('Padaria'), o('Pizzaria'), o('Hamburgueria'), o('Cafeteria'), o('Confeitaria e doceria', 'confeitaria'), o('Buffet e eventos', 'buffet'), o('Bar')] },
  { key: 'beleza', label: 'Beleza e bem-estar', aliases: ['beleza', 'bem-estar', 'bem estar', 'estetica', 'fitness'], options: [
    o('Salão de beleza'), o('Barbearia'), o('Studio de unhas', 'nail designer'), o('Spa'), o('Academia'), o('Studio de pilates', 'pilates')] },
  { key: 'servicos', label: 'Serviços profissionais', aliases: ['servicos', 'profissionais', 'escritorio', 'consultoria'], options: [
    o('Contabilidade', 'escritório de contabilidade'), o('Advocacia', 'escritório de advocacia'), o('Arquitetura', 'escritório de arquitetura'), o('Engenharia', 'empresa de engenharia'), o('Consultoria empresarial', 'consultoria empresarial'), o('Despachante'), o('Corretora de seguros', 'corretora de seguros')] },
  { key: 'construcao', label: 'Construção e imóveis', aliases: ['construcao', 'imoveis', 'imobiliario', 'obras', 'reformas'], options: [
    o('Construtora'), o('Imobiliária'), o('Incorporadora'), o('Empresa de reformas', 'reformas e construção'), o('Loja de materiais de construção'), o('Paisagismo'), o('Marmoraria')] },
  { key: 'automotivo', label: 'Automotivo', aliases: ['automotivo', 'carros', 'veiculos', 'auto'], options: [
    o('Concessionária'), o('Oficina mecânica'), o('Autoescola'), o('Estética automotiva', 'estética automotiva'), o('Loja de autopeças', 'loja de autopeças'), o('Funilaria e pintura', 'funilaria')] },
  { key: 'educacao', label: 'Educação', aliases: ['educacao', 'ensino', 'escola', 'cursos'], options: [
    o('Escola particular'), o('Curso de idiomas', 'escola de idiomas'), o('Faculdade e pós-graduação', 'faculdade'), o('Escola infantil e creche', 'escola infantil'), o('Escola de música'), o('Cursos profissionalizantes', 'curso profissionalizante')] },
  { key: 'varejo', label: 'Varejo e comércio', aliases: ['varejo', 'comercio', 'loja', 'lojas'], options: [
    o('Loja de roupas', 'loja de roupas'), o('Móveis e decoração', 'loja de móveis'), o('Eletrônicos', 'loja de eletrônicos'), o('Pet shop'), o('Joalheria'), o('Farmácia'), o('Papelaria'), o('Supermercado')] },
  { key: 'tecnologia', label: 'Tecnologia e marketing', aliases: ['tecnologia', 'ti', 'software', 'marketing', 'digital', 'tech', 'telecom'], options: [
    o('Software house', 'empresa de software'), o('SaaS e plataformas', 'empresa de software SaaS'), o('Desenvolvimento de apps', 'desenvolvimento de aplicativos'), o('Consultoria e suporte de TI', 'empresa de suporte de TI'),
    o('Agência de marketing', 'agência de marketing'), o('Agência de publicidade', 'agência de publicidade'), o('Provedor de internet'), o('Telecom e telefonia', 'empresa de telecomunicações'),
    o('Segurança eletrônica e CFTV', 'segurança eletrônica'), o('Automação industrial e comercial', 'automação industrial'), o('Hospedagem e data center', 'hospedagem de sites'),
    o('Assistência técnica de informática', 'assistência técnica informática'), o('Energia solar', 'energia solar'), o('Fintech e meios de pagamento', 'empresa de meios de pagamento')] },
  { key: 'pet', label: 'Pet', aliases: ['pet', 'pets', 'animais', 'animal'], options: [
    o('Pet shop'), o('Banho e tosa'), o('Clínica veterinária'), o('Hotel e creche pet', 'hotel para pets'), o('Adestramento', 'adestrador de cães'), o('Distribuidora de produtos pet', 'distribuidora de produtos pet'), o('Alimentos pet (ração)', 'fábrica de ração para pet')] },
  { key: 'agro', label: 'Agronegócio', aliases: ['agro', 'agronegocio', 'agricola', 'rural', 'agropecuaria'], options: [
    o('Cooperativa agrícola'), o('Agropecuária (loja)', 'agropecuária'), o('Máquinas agrícolas'), o('Frigorífico')] },
  { key: 'turismo', label: 'Turismo e hospitalidade', aliases: ['turismo', 'hospitalidade', 'hotelaria', 'viagens'], options: [
    o('Hotel'), o('Pousada'), o('Agência de viagens'), o('Espaço de eventos', 'espaço para eventos')] },
  { key: 'logistica', label: 'Logística e transporte', aliases: ['logistica', 'transporte', 'transportadora', 'fretes'], options: [
    o('Transportadora'), o('Armazém e logística', 'operador logístico'), o('Mudanças', 'empresa de mudanças')] },
];

export interface Suggestion { groups: NicheGroup[]; options: (NicheOption & { group: string })[] }

/** Sugere áreas e tipos a partir do texto digitado (sem diferenciar acento/caixa). Vazio → todas as áreas. */
export function suggestNiches(text: string): Suggestion {
  const t = slug(text);
  if (!t) return { groups: NICHE_GROUPS, options: [] };
  const groups = NICHE_GROUPS.filter((g) => slug(g.label).includes(t) || g.aliases.some((a) => a.includes(t) || (t.length >= 3 && t.startsWith(a))));
  const inGroups = new Set(groups.map((g) => g.key));
  const options = NICHE_GROUPS.filter((g) => !inGroups.has(g.key)).flatMap((g) => g.options.filter((x) => slug(x.label).includes(t) || slug(x.q).includes(t)).map((x) => ({ ...x, group: g.label }))).slice(0, 8);
  return { groups, options };
}

/**
 * Nichos que, na prática, mais compram design (posts, identidade visual, site): negócios que vendem pela imagem e pelo Instagram.
 * É uma seleção editorial da Muvens (não um ranking estatístico): ajuste a lista e a ordem conforme os seus resultados.
 */
export const DESIGN_FOCUS: { label: string; q: string; why: string }[] = [
  { label: 'Clínica odontológica', q: 'clínica odontológica', why: 'vende confiança e antes/depois' },
  { label: 'Clínica de estética', q: 'clínica de estética', why: 'Instagram é a vitrine' },
  { label: 'Restaurante', q: 'restaurante', why: 'cardápio e fotos' },
  { label: 'Hamburgueria', q: 'hamburgueria', why: 'marca forte e delivery' },
  { label: 'Cafeteria', q: 'cafeteria', why: 'experiência visual' },
  { label: 'Confeitaria e doceria', q: 'confeitaria', why: 'produto visual' },
  { label: 'Salão de beleza', q: 'salão de beleza', why: 'portfólio de trabalhos' },
  { label: 'Barbearia', q: 'barbearia', why: 'identidade e redes sociais' },
  { label: 'Academia', q: 'academia', why: 'conteúdo e promoções constantes' },
  { label: 'Studio de pilates', q: 'pilates', why: 'marca e captação por Instagram' },
  { label: 'Imobiliária', q: 'imobiliária', why: 'peças para imóveis e anúncios' },
  { label: 'Pet shop', q: 'pet shop', why: 'conteúdo e promoções' },
  { label: 'Escola e curso', q: 'escola particular', why: 'captação de matrículas' },
  { label: 'Advocacia', q: 'escritório de advocacia', why: 'autoridade e identidade' },
  { label: 'Arquitetura', q: 'escritório de arquitetura', why: 'portfólio visual' },
  { label: 'Loja de roupas', q: 'loja de roupas', why: 'catálogo e campanhas' },
];
