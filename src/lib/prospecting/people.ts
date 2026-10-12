// Pessoas de decisão citadas em páginas PÚBLICAS do site. Só registra o que aparece no texto; nunca deduz.
export interface Person { role: 'comercial' | 'compras' | 'direcao'; title: string; name?: string }

const ROLES: { role: Person['role']; re: RegExp }[] = [
  { role: 'compras', re: /gerente\s+de\s+compras|diretor(?:a)?\s+de\s+(?:compras|suprimentos)|coordenador(?:a)?\s+de\s+compras|comprador(?:a)?|analista\s+de\s+compras|supply\s+chain|suprimentos/i },
  { role: 'comercial', re: /diretor(?:a)?\s+comercial|diretor(?:a)?\s+de\s+vendas|gerente\s+comercial|head\s+(?:of\s+)?(?:sales|comercial)|cro\b/i },
  { role: 'direcao', re: /diretor(?:a)?[\s-]+(?:geral|executivo|presidente)|\bceo\b|fundador(?:a)?|co-?fundador(?:a)?|s[óo]cio(?:-| )(?:diretor|fundador|propriet[áa]rio)|propriet[áa]rio(?:a)?|presidente|\bdono\b/i },
];
const NAME = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:d[aeo]s?|e)\s+|\s+)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)?)/;

export function extractPeople(html: string): Person[] {
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out: Person[] = []; const seen = new Set<string>();
  for (const { role, re } of ROLES) {
    const g = new RegExp(re.source, 'gi'); let m: RegExpExecArray | null; let n = 0;
    while ((m = g.exec(text)) && n < 3) {
      const title = m[0].replace(/\s+/g, ' ').trim();
      const before = text.slice(Math.max(0, m.index - 50), m.index); const after = text.slice(m.index + m[0].length, m.index + m[0].length + 50);
      const name = (before.match(new RegExp(NAME.source + '\\W*$'))?.[1]) ?? after.match(new RegExp('^\\W{0,4}' + NAME.source))?.[1];
      const key = role + (name ?? title).toLowerCase();
      if (seen.has(key)) continue; seen.add(key); n++;
      out.push({ role, title, ...(name ? { name: name.trim() } : {}) });
    }
  }
  return out;
}
