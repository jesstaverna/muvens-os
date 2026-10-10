'use client';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { prepareClientDoc, registerClientDoc } from './actions';

export function DocUploader({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [st, setSt] = useState<{ busy: boolean; msg?: string; err?: boolean }>({ busy: false });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget); const file = fd.get('file'); const clientId = String(fd.get('client_id') ?? '');
    if (!(file instanceof File) || !file.size || !clientId) return setSt({ busy: false, msg: 'Escolha o cliente e o arquivo.', err: true });
    setSt({ busy: true });
    const prep = await prepareClientDoc(clientId, file.name, file.size);
    if ('error' in prep) return setSt({ busy: false, msg: prep.error, err: true });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const up = await sb.storage.from('client-docs').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined });
    if (up.error) return setSt({ busy: false, msg: 'Falha no envio do arquivo.', err: true });
    const err = await registerClientDoc(clientId, { path: prep.path, name: String(fd.get('name') || file.name), size: file.size, category: String(fd.get('category')) });
    if (err) return setSt({ busy: false, msg: err, err: true });
    form.current?.reset(); setSt({ busy: false, msg: 'Documento publicado no portal do cliente.' }); router.refresh();
  }
  return (
    <form ref={form} onSubmit={submit} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Publicar documento para o cliente</h2>
      <label className="block"><span className="label">Cliente</span><select name="client_id" required className="input"><option value="">Selecione…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="block"><span className="label">Tipo</span><select name="category" className="input"><option value="documento">Documento</option><option value="arquivo_final">Arquivo final</option><option value="relatorio">Relatório de desempenho</option></select></label>
      <label className="block"><span className="label">Nome exibido (opcional)</span><input name="name" className="input" /></label>
      <input type="file" name="file" required className="text-sm" aria-label="Arquivo" />
      <p className="text-xs text-muted">O cliente verá este arquivo imediatamente. Não publique nada interno.</p>
      <button disabled={st.busy} className="btn btn-primary">{st.busy ? 'Enviando…' : 'Publicar'}</button>
      {st.msg && <p role={st.err ? 'alert' : 'status'} className={`text-xs ${st.err ? 'text-danger' : 'text-muted'}`}>{st.msg}</p>}</form>
  );
}
