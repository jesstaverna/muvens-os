export const DIAG_LABEL = 'Diagnóstico gratuito';
export const isDiag = (interest: string | null | undefined) => (interest ?? '').toLowerCase().includes('diagnóstico gratuito');

/** Etiqueta para leads que pediram o diagnóstico gratuito pela página do site. */
export function DiagTag() {
  return <span className="ml-2 inline-flex items-center whitespace-nowrap rounded-full bg-lime px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-black">Diagnóstico gratuito</span>;
}
