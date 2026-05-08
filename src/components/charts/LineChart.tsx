import { formatCurrency } from '../../lib/utils';

interface LineData {
  label: string;
  values: number[];
  color: string;
}

interface LineChartProps {
  labels: string[];
  series: LineData[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function LineChart({ labels, series, height = 220, formatValue = formatCurrency }: LineChartProps) {
  if (!labels.length || !series.length) {
    return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Sin datos</div>;
  }

  const allValues = series.flatMap(s => s.values);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const W = 580;
  const padLeft = 60;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const chartW = W - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (i: number) => padLeft + (i / Math.max(labels.length - 1, 1)) * chartW;
  const getY = (v: number) => padTop + chartH - ((v - minVal) / range) * chartH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ minWidth: 320 }}>
        {gridLines.map(ratio => {
          const val = minVal + ratio * range;
          const y = getY(val);
          return (
            <g key={ratio}>
              <line x1={padLeft} y1={y} x2={W - padRight} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padLeft - 6} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10">
                {formatValue(val).replace('ARS\u00a0', '').replace('$\u00a0', '')}
              </text>
            </g>
          );
        })}

        {series.map(s => {
          const points = s.values.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
          const areaPoints = [
            `${getX(0)},${padTop + chartH}`,
            ...s.values.map((v, i) => `${getX(i)},${getY(v)}`),
            `${getX(s.values.length - 1)},${padTop + chartH}`,
          ].join(' ');

          return (
            <g key={s.color}>
              <polygon points={areaPoints} fill={s.color} opacity="0.08" />
              <polyline points={points} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={getX(i)} cy={getY(v)} r="4" fill="white" stroke={s.color} strokeWidth="2" />
              ))}
            </g>
          );
        })}

        {labels.map((label, i) => (
          <text key={i} x={getX(i)} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="500">
            {label.length > 8 ? label.slice(0, 8) + '…' : label}
          </text>
        ))}
      </svg>

      {series.length > 1 && (
        <div className="flex gap-4 mt-2 flex-wrap">
          {series.map(s => (
            <div key={s.color} className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: s.color, height: 3 }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
