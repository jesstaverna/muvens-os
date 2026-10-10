export const ASSET_CATEGORY: Record<string, string> = {
  logo: 'Logotipos', variacao: 'Variações de marca', kv: 'KV', brandbook: 'Brandbooks', foto: 'Fotografias', elemento: 'Elementos gráficos',
  template: 'Templates', referencia: 'Referências visuais', editavel: 'Arquivos editáveis', outro: 'Outros',
};
export const COLOR_ROLE: Record<string, string> = { primaria: 'Primária', secundaria: 'Secundária', apoio: 'Apoio', neutra: 'Neutra' };
export const FONT_USAGE: Record<string, string> = { titulo: 'Títulos', texto: 'Texto', destaque: 'Destaque' };
export const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'zip', 'psd', 'ai', 'eps', 'indd', 'fig', 'sketch', 'xd', 'mp4', 'otf', 'ttf', 'woff', 'woff2'];
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Texto corrido da base de conhecimento (para colar em briefings hoje; a IA da Fase 4 lê o mesmo conteúdo). */
export function knowledgeText(k: Record<string, any>): string {
  const L: string[] = [`MARCA: ${k.client ?? ''}`];
  const add = (t: string, v?: string | null) => v && L.push(`\n${t}:\n${v}`);
  add('TOM DE VOZ', k.tone_of_voice); add('REGRAS DE DESIGN', k.design_rules); add('RESTRIÇÕES DE APLICAÇÃO', k.restrictions); add('INSTRUÇÕES ESPECÍFICAS PARA A IA', k.ai_instructions);
  if (k.colors?.length) L.push('\nPALETA:\n' + k.colors.map((c: any) => `- ${c.name} ${c.hex} (${c.role})`).join('\n'));
  if (k.fonts?.length) L.push('\nTIPOGRAFIA:\n' + k.fonts.map((f: any) => `- ${f.name} (${f.usage})`).join('\n'));
  if (k.links?.length) L.push('\nLINKS:\n' + k.links.map((l: any) => `- ${l.label} (${l.kind}): ${l.url}`).join('\n'));
  if (k.assets?.length) L.push('\nARQUIVOS DISPONÍVEIS:\n' + k.assets.map((a: any) => `- [${ASSET_CATEGORY[a.category] ?? a.category}] ${a.name}${a.description ? ' — ' + a.description : ''}`).join('\n'));
  return L.join('\n');
}
