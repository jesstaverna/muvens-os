import { slug } from './groups';

// Escolhe a ilustração pelo tipo de empresa (categoria do Google). A 1ª regra que casar vence; sem regra, usa a ilustração do segmento.
const RULES: [RegExp, string][] = [
  [/odont|dentist|ortodont|implant/, 'dente'],
  [/veterin|\bpet\b|banho e tosa|racao|adestr/, 'pet'],
  [/advoca|juridic|escritorio de direito|advogad/, 'balanca'],
  [/contabil|contador|fiscal|tributar/, 'calculadora'],
  [/imobiliaria|corretor|incorporadora|imoveis/, 'casa'],
  [/construtora|engenharia|arquitet|reforma|marmoraria|material de construcao|materiais de construcao/, 'construcao'],
  [/academia|pilates|crossfit|personal trainer|fitness|studio de treino/, 'haltere'],
  [/escola|curso|faculdade|colegio|idioma|treinamento|educac/, 'livro'],
  [/oficina|mecanic|autopecas|funilaria|lava jato|concession|veiculo|carro|auto center|estacionamento/, 'carro'],
  [/salao|barbearia|estetica|nail|spa\b|beleza|cabeleireir|depila/, 'beleza'],
  [/restaurante|pizzaria|hamburgueria|padaria|confeitaria|cafeteria|bar\b|buffet|lanchonete|gastronom|doceria|sorveteria/, 'alimentacao'],
  [/clinica|medic|hospital|laboratorio|fisioterap|psicolog|nutri|oftalm|otic/, 'saude'],
  [/software|sistema|aplicativo|tecnologia|informatica|ti\b|provedor|internet|agencia|marketing|publicidade|design/, 'tecnologia'],
  [/transportadora|logistic|frete|armazem|entrega|motoboy/, 'logistica'],
  [/agro|rural|fazenda|cooperativa|semente|trator|pecuar|lavoura/, 'agro'],
  [/hotel|pousada|turismo|viagem|hostel|resort/, 'turismo'],
  [/industria|fabrica|metalurg|usinagem|siderurg|caldeiraria|confeccao|textil|plastico|quimic|moveleir|madeireira|grafica|embalage/, 'industria'],
  [/consultoria|escritorio|servicos? profission|assessoria|seguros|corretora/, 'servicos'],
];

export function illustrationKey(category: string | null | undefined, segmentKey: string): string {
  const t = slug(category ?? '');
  for (const [re, key] of RULES) if (t && re.test(t)) return key;
  return segmentKey;
}
