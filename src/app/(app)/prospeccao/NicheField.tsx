'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { suggestNiches } from '@/lib/prospecting/niches';

const MAX = 5;

/** Campo de nicho com sugestões: ao digitar uma área ampla (ex.: "indústria"), mostra os tipos para marcar um ou mais. */
export function NicheField({ children }: { children?: ReactNode }) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const [picked, setPicked] = useState<{ q: string; label: string }[]>([]);
  const sug = useMemo(() => suggestNiches(text), [text]);
  const has = (q: string) => picked.some((p) => p.q === q);
  const toggle = (q: string, label: string) => setPicked((c) => (has(q) ? c.filter((p) => p.q !== q) : c.length >= MAX ? c : [...c, { q, label }]));
  const show = focus || picked.length > 0 || text.length > 0;
  const chip = (active: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-transparent bg-lime font-medium text-black' : 'border-line hover:bg-subtle'}`;

  return (
    <div onFocus={() => setFocus(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false); }} >
      <div className="grid gap-3 md:grid-cols-[1fr_16rem_auto] md:items-end">
      <label className="block"><span className="label">Nicho / área</span>
        <input name="niche" value={text} onChange={(e) => setText(e.target.value)} required={picked.length === 0} minLength={2} maxLength={80} autoComplete="off" className="input"
          placeholder="ex.: indústria, clínica odontológica, restaurante" aria-describedby="niche-help" /></label>
      {children}
      </div>
      {picked.map((p) => <input key={p.q} type="hidden" name="niches" value={p.q} />)}

      {show && (
        <div id="niche-help" className="mt-3 rounded-xl border border-line bg-subtle/50 p-3">
          {picked.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted">Selecionados ({picked.length}/{MAX}) — uma busca para cada:</span>
              {picked.map((p) => <button type="button" key={p.q} onClick={() => toggle(p.q, p.label)} className={chip(true)}>{p.label}<X className="h-3 w-3" strokeWidth={2} /></button>)}
              <button type="button" onClick={() => setPicked([])} className="text-muted underline">limpar</button></div>)}

          {sug.groups.length === 1 || (text && sug.groups.length > 0 && sug.groups.length <= 2) ? sug.groups.map((g) => (
            <div key={g.key} className="mb-2 last:mb-0"><div className="mb-2 text-xs text-muted">Tipos de <b className="text-fg">{g.label}</b> — marque um ou mais, ou deixe em branco para buscar “{text || g.label}”:</div>
              <div className="flex flex-wrap gap-2">{g.options.map((op) => <button type="button" key={op.q} onClick={() => toggle(op.q, op.label)} className={chip(has(op.q))} aria-pressed={has(op.q)}>{has(op.q) && <Check className="h-3 w-3" strokeWidth={2.2} />}{op.label}</button>)}</div></div>
          )) : !text ? (
            <div><div className="mb-2 text-xs text-muted">Escolha uma área para ver os tipos, ou digite livremente:</div>
              <div className="flex flex-wrap gap-2">{sug.groups.map((g) => <button type="button" key={g.key} onClick={() => setText(g.label)} className={chip(false)}>{g.label}</button>)}</div></div>
          ) : sug.groups.length > 2 ? (
            <div className="flex flex-wrap gap-2">{sug.groups.map((g) => <button type="button" key={g.key} onClick={() => setText(g.label)} className={chip(false)}>{g.label}</button>)}</div>
          ) : null}

          {text && sug.options.length > 0 && (
            <div className="mt-3 border-t border-line pt-3"><div className="mb-2 text-xs text-muted">Sugestões relacionadas:</div>
              <div className="flex flex-wrap gap-2">{sug.options.map((op) => <button type="button" key={op.q} onClick={() => toggle(op.q, op.label)} className={chip(has(op.q))} aria-pressed={has(op.q)}>{has(op.q) && <Check className="h-3 w-3" strokeWidth={2.2} />}{op.label}<span className="text-[10px] opacity-60">{op.group}</span></button>)}</div></div>)}
          {picked.length > 0 && <p className="mt-3 text-xs text-muted">Com tipos selecionados, o texto digitado é ignorado. A análise dos sites de cada grupo acontece automaticamente ao abrir o grupo.</p>}
        </div>)}
    </div>
  );
}
