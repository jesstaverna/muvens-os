'use client';
import { useEffect } from 'react';

/** Erro inesperado no navegador. Depois de uma atualização do sistema, páginas abertas podem apontar para arquivos antigos: recarregar resolve. */
export default function ErroDePagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported|Importing a module script failed/i.test(`${error.name} ${error.message}`);
  useEffect(() => {
    // 1 recarga automática quando for arquivo antigo (nova versão publicada); evita laço com sessionStorage
    try { if (stale && !sessionStorage.getItem('mv-reloaded')) { sessionStorage.setItem('mv-reloaded', '1'); window.location.reload(); } } catch { /* sem sessionStorage */ }
  }, [stale]);
  return (
    <main className="grid min-h-screen place-items-center bg-[#F7F7F4] px-6 text-center text-neutral-900">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Não foi possível exibir esta página</h1>
        <p className="mt-2 text-sm text-neutral-600">{stale ? 'O sistema foi atualizado enquanto a página estava aberta. Recarregue para continuar.' : 'Ocorreu um erro inesperado. Tente novamente; se continuar, envie o código abaixo para o suporte.'}</p>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-[#DCEA1E]">Recarregar</button>
          <button onClick={() => reset()} className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm">Tentar de novo</button>
        </div>
        <p className="mt-5 break-words text-xs text-neutral-500">{error.digest ? `Código: ${error.digest} · ` : ''}{error.message.slice(0, 160)}</p>
      </div>
    </main>
  );
}
