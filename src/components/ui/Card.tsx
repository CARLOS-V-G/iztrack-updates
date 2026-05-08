import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  color: 'blue' | 'green' | 'red' | 'amber' | 'cyan';
  trend?: number;
}

const colorMap = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-600', text: 'text-blue-600' },
  green: { bg: 'bg-green-50', icon: 'bg-green-600', text: 'text-green-600' },
  red: { bg: 'bg-red-50', icon: 'bg-red-600', text: 'text-red-600' },
  amber: { bg: 'bg-amber-50', icon: 'bg-amber-500', text: 'text-amber-600' },
  cyan: { bg: 'bg-cyan-50', icon: 'bg-cyan-600', text: 'text-cyan-600' },
};

export function StatCard({ title, value, subtitle, icon, color, trend }: StatCardProps) {
  const colors = colorMap[color];
  return (
    <Card>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
            <p className="text-2xl font-bold text-slate-900 truncate">{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
            {trend !== undefined && (
              <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs período anterior
              </p>
            )}
          </div>
          <div className={`${colors.bg} p-3 rounded-lg ml-4 flex-shrink-0`}>
            <div className={`${colors.text} w-6 h-6`}>{icon}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
