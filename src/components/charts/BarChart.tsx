import { formatCurrency } from '../../lib/utils';

interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  showValues?: boolean;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, height = 200, showValues = true, formatValue = formatCurrency }: BarChartProps) {
  if (!data.length) return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Sin datos</div>;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.min(60, Math.floor(600 / data.length) - 12);

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: data.length * (barWidth + 12) + 40 }}>
        <svg width="100%" height={height + 60} viewBox={`0 0 ${data.length * (barWidth + 12) + 40} ${height + 60}`}>
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = height - ratio * height + 10;
            return (
              <g key={ratio}>
                <line x1="40" y1={y} x2={data.length * (barWidth + 12) + 40} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x="36" y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10">
                  {formatValue(maxVal * ratio).replace('$', '')}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const barH = Math.max((d.value / maxVal) * height, 2);
            const x = 40 + i * (barWidth + 12);
            const y = height + 10 - barH;
            const color = d.color || '#1d4ed8';

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx="4"
                  fill={color}
                  opacity="0.9"
                />
                {showValues && d.value > 0 && (
                  <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="500">
                    {formatValue(d.value).replace('ARS', '').replace('$', '$')}
                  </text>
                )}
                <text
                  x={x + barWidth / 2}
                  y={height + 26}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontWeight="500"
                >
                  {d.label.length > 8 ? d.label.slice(0, 8) + '…' : d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
