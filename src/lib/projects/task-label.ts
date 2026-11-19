/** Identificador de tarefa único da agência, separado do título editável. */
export function taskCode(number: number | string | null | undefined): string {
  if (number === null || number === undefined || number === '') return '';
  const n = Number(number);
  return Number.isSafeInteger(n) && n > 0 ? '#' + String(n).padStart(5, '0') : '';
}

/** Exemplo: #00001 [MUVENS] Criar calendário editorial. */
export function taskDisplayTitle(
  number: number | string | null | undefined,
  clientName: string | null | undefined,
  title: string,
): string {
  const client = clientName?.trim() ? '[' + clientName.trim().toLocaleUpperCase('pt-BR') + ']' : '';
  return [taskCode(number), client, title.trim()].filter(Boolean).join(' ');
}
