'use client';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { prepareBrandUpload, registerBrandAsset } from './actions';
import { ASSET_CATEGORY } from '@/lib/brand';

export function BrandUploader({ clientId }: { clientId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [st, setSt] = useState<{ busy: boolean; msg?: string; err?: boolean }>({ busy: false });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) return setSt({ busy: false, msg: 'Selecione um arquivo.', err: true });
    setSt({ busy: true });
    const prep = await prepareBrandUpload(clientId, file.name, file.size);
    if ('error' in prep) return setSt({ busy: false, msg: prep.error, err: true });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const up = await sb.storage.from('brand-assets').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined });
    if (up.error) return setSt({ busy: false, msg: 'Falha no envio do arquivo.', err: true });
    const err = await registerBrandAsset(clientId, { path: prep.path, name: String(fd.get('name') || file.name), size: file.size, mime: file.type, category: String(fd.get('category')), tags: String(fd.get('tags') ?? ''), description: String(fd.get('description') ?? ''), downloadable: fd.get('downloadable') === 'on' });
    if (err) return setSt({ busy: false, msg: err, err: true });
    form.current?.reset();
    setSt({ busy: false, msg: 'Arquivo enviado.' });
    router.refresh();
  }
  return (
    <form ref={form} onSubmit={submit} className="card space-y-4">
      <h2 className="text-base font-semibold">Enviar arquivo</h2>
      <input type="file" name="file" required className="text-sm" aria-label="Arquivo" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Categoria</span><select name="category" className="input">{Object.entries(ASSET_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span className="label">Nome (opcional)</span><input name="name" className="input" /></label>
        <label><span className="label">Tags (separadas por vírgula)</span><input name="tags" className="input" placeholder="positivo, horizontal" /></label>
        <label><span className="label">Descrição</span><input name="description" className="input" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="downloadable" defaultChecked /> Download liberado para a equipe <span className="text-xs text-muted">(desmarque para restringir ao administrador)</span></label>
      <button disabled={st.busy} className="btn btn-primary">{st.busy ? 'Enviando…' : 'Enviar'}</button>
      {st.msg && <p role={st.err ? 'alert' : 'status'} className={`text-xs ${st.err ? 'text-danger' : 'text-muted'}`}>{st.msg}</p>}
    </form>
  );
}
