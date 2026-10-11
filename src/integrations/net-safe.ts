import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Bloqueia IPs privados/locais (proteção contra SSRF ao buscar sites de terceiros). */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

export function normalizeUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  if ((/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) || /^(javascript|data|file|ftp|mailto|tel|blob):/i.test(raw)) return null;
  try { const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); return u.protocol === 'http:' || u.protocol === 'https:' ? u : null; } catch { return null; }
}

export interface SafeFetchOptions { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; allowPrivate?: boolean }

/** GET seguro: só http(s), resolve DNS e recusa IP privado, limita tempo, tamanho e redirecionamentos. */
export async function safeFetchText(url: string, o: SafeFetchOptions = {}): Promise<{ html: string; finalUrl: string }> {
  const { timeoutMs = 8000, maxBytes = 1_500_000, maxRedirects = 4, allowPrivate = false } = o;
  let current = normalizeUrl(url);
  if (!current) throw new Error('URL inválida');
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!allowPrivate) {
      const host = current.hostname.replace(/^\[|\]$/g, '');
      const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Endereço não permitido');
    }
    const res: Response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'MuvensOS-Analyzer/1.0 (+análise pública de presença digital)', accept: 'text/html,*/*;q=0.5' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, current); if (!/^https?:$/.test(current.protocol)) throw new Error('Redirecionamento inválido'); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader(); if (!reader) throw new Error('Resposta vazia');
    const chunks: Uint8Array[] = []; let size = 0;
    while (size < maxBytes) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
    reader.cancel().catch(() => undefined);
    return { html: new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks)), finalUrl: current.toString() };
  }
  throw new Error('Redirecionamentos demais');
}
