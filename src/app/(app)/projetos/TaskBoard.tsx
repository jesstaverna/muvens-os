'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, ArrowRight, CalendarDays,
  CircleDot, Clock3, FilterX, GripVertical, ListFilter, Search, Users, X,
} from 'lucide-react';
import { useMemo, useRef, useState, useTransition } from 'react';
import { moveTask } from './actions';
import { AREAS } from '@/lib/projects/board';

export interface KTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_on: string | null;
  assignee: string | null;
  assignees: string[];
  contacts: { name: string; role: string | null }[];
  client: string | null;
  project: string | null;
  out_of_scope: boolean;
  late: boolean;
  starts_on: string | null;
  review_due_on: string | null;
  changes_due_on: string | null;
  area: string | null;
  origin: string;
  project_id: string;
  client_wait_days: number;
}

const COLS = [
  {key:'solicitada',label:'Solicitação de cliente',tone:'#DCEA1E',description:'Pedidos aguardando triagem'},
  {key:'aguardando_cliente',label:'Aguardando cliente',tone:'#E5AB51',description:'Conteúdo ou resposta pendente'},
  {key:'a_fazer',label:'A fazer',tone:'#B7B3F4',description:'Itens prontos para produção'},
  {key:'em_andamento',label:'Em andamento',tone:'#74B9EF',description:'Equipe trabalhando'},
  {key:'produzido',label:'Produzido',tone:'#88BDB4',description:'Pronto para apresentação'},
  {key:'enviado',label:'Em aprovação',tone:'#D6B1EA',description:'Aguardando aprovação'},
  {key:'ajustes',label:'Ajustes',tone:'#E89D9D',description:'Correções solicitadas'},
  {key:'aprovado',label:'Aprovado',tone:'#ADD89E',description:'Aprovado pelo cliente'},
  {key:'entregue',label:'Entregue',tone:'#7BB88D',description:'Demanda finalizada'},
] as const;

const PRIORITY: Record<string,{label:string;color:string}> = {
  urgente:{label:'Urgente',color:'text-red-600 dark:text-red-400'},
  alta:{label:'Alta',color:'text-amber-600 dark:text-amber-400'},
  media:{label:'Média',color:'text-blue-600 dark:text-blue-400'},
  baixa:{label:'Baixa',color:'text-muted'},
};
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()).join('');
const day = (value:string|null) => value ? value.slice(8,10)+'/'+value.slice(5,7) : 'Sem prazo';
const people = (t:KTask) => [...new Set([...(t.assignee ? [t.assignee] : []),...t.assignees])];
const MAIN_COLS = new Set(['solicitada','aguardando_cliente','a_fazer','em_andamento','enviado','ajustes']);

function BoardCard({
  task, pending, canWrite, onMove,
}:{
  task:KTask;pending:boolean;canWrite:boolean;onMove:(id:string,status:string)=>void;
}) {
  const names=people(task);
  const p=PRIORITY[task.priority]??PRIORITY.media;
  return (
    <article draggable={canWrite&&!pending}
      onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',task.id);}}
      className={'group relative rounded-xl border bg-surface px-3.5 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,.025)] transition hover:-translate-y-[1px] hover:border-fg/20 hover:shadow-md ' +
        (pending?'opacity-65 ':'')+(task.status==='solicitada'?'border-[#DCEA1E]/60 ':'border-line ')+(canWrite?'cursor-grab active:cursor-grabbing':'')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="min-w-0 truncate rounded-md bg-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-[.035em] text-muted">
          {task.client || 'Agência Muvens'}
        </span>
        {canWrite && <GripVertical className="h-[16px] w-[16px] shrink-0 text-muted/40 opacity-0 transition group-hover:opacity-100" aria-hidden="true"/>}
      </div>
      <Link href={'/projetos/tarefas/'+task.id} className="block break-words text-[13px] font-semibold leading-[1.55] text-fg hover:underline">
        {task.title}
      </Link>
      {task.project && <p className="mt-1.5 truncate text-[11px] text-muted" title={task.project}>{task.project}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/70 pt-3">
        <span className={'inline-flex items-center gap-1 text-[11px] font-medium ' + (task.late?'text-danger':'text-muted')}
          title={task.late?'Prazo vencido':'Prazo previsto'}>
          {task.late?<AlertCircle className="h-3.5 w-3.5"/>:<CalendarDays className="h-3.5 w-3.5"/>}
          {day(task.due_on)}{task.late?' · atrasada':''}
        </span>
        <span className={'inline-flex items-center gap-1 text-[11px] font-semibold ' + p.color}>
          <CircleDot className="h-3 w-3"/>{p.label}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 -space-x-1.5" title={names.length?names.join(', '):'Responsável a definir'}>
          {names.slice(0,3).map((name,i)=><span key={name}
            className={'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-surface text-[10px] font-bold ' + (i===0?'bg-[#DCEA1E] text-black':'bg-subtle text-fg')}>
            {initials(name)}
          </span>)}
          {names.length>3&&<span className="grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-subtle text-[10px] text-muted">+{names.length-3}</span>}
          {names.length===0&&<span className="inline-flex items-center gap-1 text-[11px] text-muted"><Users className="h-3.5 w-3.5"/> A definir</span>}
        </div>
        {task.origin==='cliente'?<span className="rounded-full bg-[#DCEA1E]/20 px-2 py-1 text-[10px] font-medium text-fg">Cliente</span>
          :task.area&&AREAS[task.area]?<span className="truncate text-[10px] text-muted">{AREAS[task.area]}</span>:null}
      </div>
      {task.out_of_scope && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] font-medium text-warn">Fora do escopo contratado</div>}
      {canWrite&&<label className="mt-3 flex items-center gap-2 border-t border-line/70 pt-2.5 text-[11px] text-muted">
        <span className="shrink-0">Mover:</span>
        <select aria-label={'Mover '+task.title} value={task.status} onChange={e=>onMove(task.id,e.target.value)}
          disabled={pending} className="min-w-0 w-full cursor-pointer rounded-md bg-transparent py-1 text-[11px] text-muted outline-none focus-visible:ring-2 focus-visible:ring-lime">
          {COLS.map(c=><option key={c.key} value={c.key} disabled={c.key==='solicitada'&&task.origin!=='cliente'}>{c.label}</option>)}
        </select>
      </label>}
    </article>
  );
}

export function TaskBoard({tasks,canWrite=true}:{tasks:KTask[];canWrite?:boolean}) {
  const router=useRouter();
  const [pending,start]=useTransition();
  const [error,setError]=useState<string|null>(null);
  const [over,setOver]=useState<string|null>(null);
  const [term,setTerm]=useState('');
  const [priority,setPriority]=useState('todos');
  const [assignee,setAssignee]=useState('todos');
  const [lateOnly,setLateOnly]=useState(false);
  const [activeOnly,setActiveOnly]=useState(false);
  const boardRef=useRef<HTMLDivElement|null>(null);

  const owners=useMemo(()=>[...new Set(tasks.flatMap(people))].sort((a,b)=>a.localeCompare(b,'pt-BR')), [tasks]);
  const filtered=useMemo(()=>tasks.filter(task=>{
    if (priority!=='todos' && task.priority!==priority) return false;
    if (assignee==='sem_responsavel' && people(task).length>0) return false;
    if (assignee!=='todos' && assignee!=='sem_responsavel' && !people(task).includes(assignee)) return false;
    if (lateOnly && !task.late) return false;
    if (term.trim()) {
      const words=[task.title,task.client??'',task.project??'',...people(task)].join(' ').toLocaleLowerCase('pt-BR');
      if (!words.includes(term.trim().toLocaleLowerCase('pt-BR'))) return false;
    }
    return true;
  }),[tasks,term,priority,assignee,lateOnly]);
  const displayedColumns=activeOnly?COLS.filter(c=>MAIN_COLS.has(c.key)):COLS;
  const totalActive=tasks.filter(t=>!['entregue','aprovado'].includes(t.status)).length;
  const totalTriage=tasks.filter(t=>t.status==='solicitada').length;
  const totalLate=tasks.filter(t=>t.late).length;

  function move(id:string,status:string) {
    const t=tasks.find(item=>item.id===id);
    if (!canWrite || !t || t.status===status) return;
    if (status==='solicitada' && t.origin!=='cliente') {
      setError('A coluna Solicitação de cliente é exclusiva para pedidos recebidos pelo portal.');
      return;
    }
    setError(null);
    start(async()=>{
      const err=await moveTask(id,status);
      if(err) setError(err);
      router.refresh();
    });
  }

  const reset=()=>{setTerm('');setPriority('todos');setAssignee('todos');setLateOnly(false);};
  const hasFilters=Boolean(term.trim()||priority!=='todos'||assignee!=='todos'||lateOnly);
  return <section aria-label="Quadro de produção" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        {label:'Demandas ativas',value:totalActive,Icon:Clock3},
        {label:'Solicitações para triagem',value:totalTriage,Icon:ListFilter},
        {label:'Tarefas em atraso',value:totalLate,Icon:AlertCircle},
      ].map(stat=><div key={stat.label} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
        <div><p className="text-xs text-muted">{stat.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-subtle"><stat.Icon className="h-[18px] w-[18px] text-muted"/></span>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface p-3">
      <label className="relative min-w-[190px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"/>
        <input value={term} onChange={e=>setTerm(e.target.value)}
          placeholder="Buscar tarefa, cliente ou projeto" aria-label="Buscar no quadro"
          className="input !pl-9 !py-2"/>
      </label>
      <select value={assignee} onChange={e=>setAssignee(e.target.value)} aria-label="Filtrar por responsável"
        className="input !w-auto min-w-[150px] !py-2">
        <option value="todos">Todos os responsáveis</option><option value="sem_responsavel">Sem responsável</option>
        {owners.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
      <select value={priority} onChange={e=>setPriority(e.target.value)} aria-label="Filtrar por prioridade"
        className="input !w-auto min-w-[130px] !py-2">
        <option value="todos">Todas as prioridades</option>
        {Object.entries(PRIORITY).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
      </select>
      <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium">
        <input type="checkbox" checked={lateOnly} onChange={e=>setLateOnly(e.target.checked)}/> Atrasadas
      </label>
      {hasFilters&&<button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-subtle"><FilterX className="h-4 w-4"/> Limpar</button>}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">Kanban de produção</span>
        <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs tabular-nums text-muted">{filtered.length} {filtered.length===1?'tarefa':'tarefas'}</span>
        {pending&&<span className="text-xs text-muted">Salvando movimentação…</span>}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted"><input checked={activeOnly} onChange={e=>setActiveOnly(e.target.checked)} type="checkbox"/> Etapas principais</label>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true"/>
        <button aria-label="Rolar quadro para a esquerda" title="Ver colunas anteriores" onClick={()=>boardRef.current?.scrollBy({left:-580,behavior:'smooth'})} type="button"
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface hover:bg-subtle"><ArrowLeft className="h-4 w-4"/></button>
        <button aria-label="Rolar quadro para a direita" title="Ver próximas colunas" onClick={()=>boardRef.current?.scrollBy({left:580,behavior:'smooth'})} type="button"
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface hover:bg-subtle"><ArrowRight className="h-4 w-4"/></button>
      </div>
    </div>
    {error&&<div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"><AlertCircle className="h-4 w-4 shrink-0"/>{error}<button className="ml-auto" onClick={()=>setError(null)} title="Fechar"><X className="h-4 w-4"/></button></div>}

    <div ref={boardRef} className={'flex min-h-[440px] snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:thin] ' + (pending?'opacity-65':'')}>
      {displayedColumns.map(col=>{
        const items=filtered.filter(task=>task.status===col.key);
        return <section key={col.key} aria-label={col.label} onDragOver={event=>{if(!canWrite)return;event.preventDefault();setOver(col.key);}}
          onDragLeave={()=>setOver(null)}
          onDrop={event=>{event.preventDefault();setOver(null);const id=event.dataTransfer.getData('text/plain');if(id)move(id,col.key);}}
          className={'flex min-h-[425px] w-[285px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-subtle/60 p-2.5 sm:w-[306px] xl:w-[315px] '+
            (over===col.key?'border-[#DCEA1E] bg-[#DCEA1E]/10':'border-line')}>
          <header className="mb-3 rounded-xl border border-line/80 bg-surface px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:col.tone}}/>
                <h3 className="truncate text-[13px] font-semibold" title={col.label}>{col.label}</h3>
              </div>
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-subtle px-1.5 text-[11px] font-semibold tabular-nums text-muted">{items.length}</span>
            </div>
            <p className="mt-1.5 pl-5 text-[10px] text-muted">{col.description}</p>
          </header>
          <div className="flex-1 space-y-2.5">
            {items.map(t=><BoardCard key={t.id} task={t} pending={pending} canWrite={canWrite} onMove={move}/>)}
            {items.length===0&&<div className="rounded-xl border border-dashed border-line/90 bg-surface/30 px-4 py-10 text-center text-[11px] leading-5 text-muted">
              Nenhuma tarefa nesta etapa
            </div>}
          </div>
          {canWrite&&col.key==='a_fazer'&&<Link href="/projetos/tarefas/nova"
            className="mt-3 block rounded-xl border border-dashed border-line bg-surface/60 px-3 py-3 text-center text-xs font-medium text-muted hover:border-fg/20 hover:text-fg">
            + Nova tarefa
          </Link>}
          {col.key==='solicitada'&&<Link href="/portal?tab=acessos" className="mt-3 block rounded-xl border border-dashed border-[#DCEA1E]/40 bg-[#DCEA1E]/10 px-3 py-3 text-center text-xs font-medium hover:bg-[#DCEA1E]/20">
            Gerenciar acesso dos clientes
          </Link>}
        </section>;
      })}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted">
      <span>{canWrite?'Arraste cartões para mudar de etapa ou use o seletor do cartão.':'Seu perfil possui acesso de leitura a este quadro.'}</span>
      {activeOnly&&<span>As etapas concluídas e de produção intermediária estão ocultas nesta visualização.</span>}
      {hasFilters&&filtered.length===0&&<span>Nenhuma tarefa corresponde aos filtros.</span>}
    </div>
  </section>;
}
