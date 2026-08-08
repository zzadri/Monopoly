import { useMemo } from 'react';
import { PLAYER_COLORS } from 'shared';

interface NetWorthChartProps {
  readonly history: Record<string, number[]>;
  readonly height?: number;
}

export function NetWorthChart({ history, height = 220 }: NetWorthChartProps) {
  const { paths, maxY, maxX, names } = useMemo(() => {
    const names = Object.keys(history);
    const maxX = Math.max(2, ...names.map((n) => history[n].length));
    const maxY = Math.max(100, ...names.flatMap((n) => history[n]));
    const W = 600;
    const H = 300;
    const paths = names.map((name, i) => {
      const pts = history[name];
      const d = pts
        .map((v, x) => `${x === 0 ? 'M' : 'L'}${((x / (maxX - 1)) * W).toFixed(1)},${(H - (v / maxY) * H).toFixed(1)}`)
        .join(' ');
      return { name, d, color: PLAYER_COLORS[i % PLAYER_COLORS.length] };
    });
    return { paths, maxY, maxX, names };
  }, [history]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="networth-chart">
      <svg viewBox="-52 -10 668 340" style={{ width: '100%', height }} role="img" aria-label="Valeur nette au fil du temps">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={0} x2={600} y1={300 - t * 300} y2={300 - t * 300} stroke="var(--line-strong)" strokeDasharray="4 6" strokeWidth={1} />
            <text x={-8} y={304 - t * 300} textAnchor="end" fontSize={13} fill="var(--ink-faint)">
              ${Math.round((maxY * t) / 100) * 100}
            </text>
          </g>
        ))}
        <text x={600} y={324} textAnchor="end" fontSize={13} fill="var(--ink-faint)">{maxX} tours</text>
        {paths.map((p) => (
          <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 14 }}>
        {names.map((n, i) => (
          <span key={n} className="row" style={{ gap: 6, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
