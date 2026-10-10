import { moneyCompact } from '@/lib/format';

export interface BarPoint { label: string; a: number; b?: number; c?: number }

/** Gráfico de barras agrupadas em SVG (sem dependências). a = recebido, b = despesas. */
export function RevenueChart({ data }: { data: BarPoint[] }) {
  const w = 720, h = 220, pad = { l: 8, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const slot = (w - pad.l - pad.r) / data.length;
  const bw = Math.min(18, slot / 3);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const total = data.reduce((s, d) => s + d.a + (d.b ?? 0), 0);
  if (total === 0) return <div className="grid h-[220px] place-items-center text-sm text-muted">Sem movimentação financeira nos últimos meses.</div>;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Recebido e despesas por mês">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="rgb(var(--line))" strokeDasharray={t ? '3 4' : undefined} />
            {t > 0 && <text x={pad.l} y={y(max * t) - 4} fontSize="10" fill="rgb(var(--muted))">{moneyCompact(max * t)}</text>}
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={d.label}>
              <rect x={cx - bw - 1} y={y(d.a)} width={bw} height={Math.max(h - pad.b - y(d.a), 0)} rx="3" fill="#DCEA1E"><title>{`${d.label} — recebido ${moneyCompact(d.a)}`}</title></rect>
              <rect x={cx + 1} y={y(d.b ?? 0)} width={bw} height={Math.max(h - pad.b - y(d.b ?? 0), 0)} rx="3" fill="rgb(var(--fg))" opacity="0.8"><title>{`${d.label} — despesas ${moneyCompact(d.b ?? 0)}`}</title></rect>
              <text x={cx} y={h - 10} fontSize="10" textAnchor="middle" fill="rgb(var(--muted))">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-lime" />Recebido</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-fg/80" />Despesas pagas</span>
      </figcaption>
    </figure>
  );
}

export function ProgressBar({ value, tone = 'lime' }: { value: number; tone?: 'lime' | 'danger' }) {
  const v = Math.min(Math.max(value, 0), 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tone === 'danger' ? 'bg-danger' : 'bg-lime'}`} style={{ width: `${v}%` }} />
    </div>
  );
}
