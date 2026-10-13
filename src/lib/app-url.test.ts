import { afterEach, describe, expect, it } from 'vitest';
import { appUrl, isValidAppUrl } from './app-url';

const KEYS = ['NEXT_PUBLIC_APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('appUrl', () => {
  it('prefere NEXT_PUBLIC_APP_URL, sem barra final', () => { process.env.NEXT_PUBLIC_APP_URL = 'https://app.muvens.com/'; expect(appUrl()).toBe('https://app.muvens.com'); });
  it('sem a variável, usa o domínio de produção da Vercel', () => { delete process.env.NEXT_PUBLIC_APP_URL; process.env.VERCEL_PROJECT_PRODUCTION_URL = 'muvens-os.vercel.app'; expect(appUrl()).toBe('https://muvens-os.vercel.app'); });
  it('variável inválida é ignorada; sem nada, vazio', () => { process.env.NEXT_PUBLIC_APP_URL = 'meu-site'; delete process.env.VERCEL_PROJECT_PRODUCTION_URL; delete process.env.VERCEL_URL; expect(appUrl()).toBe(''); expect(isValidAppUrl('')).toBe(false); expect(isValidAppUrl('https://x.com')).toBe(true); });
});
