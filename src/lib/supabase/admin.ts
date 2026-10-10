import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service role: ignora RLS. SOMENTE no servidor (worker, rotinas internas). A chave nunca vai ao navegador. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
