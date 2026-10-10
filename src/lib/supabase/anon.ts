import { createClient as create } from '@supabase/supabase-js';

/** Cliente anônimo sem sessão — só para as RPCs públicas (link de proposta). Nunca tem acesso direto a tabelas. */
export function createAnonClient() {
  return create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
