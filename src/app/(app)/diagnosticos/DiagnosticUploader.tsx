'use client';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useState, useRef, type FormEvent } from 'react';
import { DIAGNOSTIC_AREAS, type DiagnosticArea } from '@/lib/diagnostics';
import { prepareDiagnosticUpload, registerDiagnosticUpload } from './actions';

export function DiagnosticUploader({id,scopes}:{id:string;scopes:DiagnosticArea[]}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get('file');
    const scope = String(data.get('scope')) as DiagnosticArea;
    if (!(file instanceof File) || !file.size) return setMessage('Escolha uma imagem.');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return setMessage('Use PNG, JPG ou WebP com até 5 MB.');
    }
    setBusy(true);
    try {
      const prep = await prepareDiagnosticUpload(id,scope,file.name,file.size,file.type);
      if ('error' in prep) throw new Error(prep.error);
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
      const result = await client.storage.from('diagnostic-evidence').uploadToSignedUrl(prep.path,prep.token,file,{contentType:file.type});
      if (result.error) throw new Error('Falha no upload da imagem.');
      const err = await registerDiagnosticUpload(id,{scope,path:prep.path,name:file.name,size:file.size,mime:file.type});
      if (err) throw new Error(err);
      form.current?.reset();
      setMessage('Print salvo com sucesso.');
      router.refresh();
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.'); }
    finally { setBusy(false); }
  }
  return (
    <form ref={form} onSubmit={upload} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Área do print</span>
          <select name="scope" className="input">{scopes.map(s=><option key={s} value={s}>{DIAGNOSTIC_AREAS[s]}</option>)}</select></label>
        <label><span className="label">Imagem de evidência</span>
          <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required className="block w-full py-2 text-sm"/></label>
      </div>
      <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? 'Enviando…' : 'Adicionar print'}</button>
      <p className="text-xs text-muted">Até 5 MB por imagem. Imagens privadas, usadas na análise pela IA; não são publicadas no link do cliente.</p>
      {message && <p role="status" className="text-xs">{message}</p>}
    </form>
  );
}
