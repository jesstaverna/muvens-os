'use client';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { prepareTaskUpload, registerTaskFile } from './actions';

const MAX = 50 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/zip', 'application/x-zip-compressed', 'video/mp4'];

export function FileUploader({ taskId }: { taskId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; msg?: string; err?: boolean }>({ busy: false });

  async function upload() {
    const file = ref.current?.files?.[0];
    if (!file) return setState({ busy: false, msg: 'Selecione um arquivo.', err: true });
    if (file.size > MAX) return setState({ busy: false, msg: 'Arquivo acima de 50 MB.', err: true });
    if (!TYPES.includes(file.type)) return setState({ busy: false, msg: 'Formato não permitido (PDF, PNG, JPG, WEBP, GIF, ZIP, MP4).', err: true });
    setState({ busy: true });
    const prep = await prepareTaskUpload(taskId, file.name);
    if ('error' in prep) return setState({ busy: false, msg: prep.error, err: true });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const up = await sb.storage.from('task-files').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
    if (up.error) return setState({ busy: false, msg: 'Falha no envio do arquivo.', err: true });
    const reg = await registerTaskFile(taskId, prep.path, file.name, file.size);
    if (reg) return setState({ busy: false, msg: reg, err: true });
    if (ref.current) ref.current.value = '';
    setState({ busy: false, msg: 'Arquivo enviado.' });
    router.refresh();
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2"><input ref={ref} type="file" className="max-w-full text-sm" aria-label="Arquivo da tarefa" /><button type="button" onClick={upload} disabled={state.busy} className="btn btn-sm">{state.busy ? 'Enviando…' : 'Enviar arquivo'}</button></div>
      {state.msg && <p role={state.err ? 'alert' : 'status'} className={`text-xs ${state.err ? 'text-danger' : 'text-muted'}`}>{state.msg}</p>}
    </div>
  );
}
