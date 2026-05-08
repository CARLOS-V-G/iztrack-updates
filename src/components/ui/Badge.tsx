interface BadgeProps {
  label: string;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'slate' | 'cyan';
}

const colorMap = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
  cyan: 'bg-cyan-100 text-cyan-700',
};

export function Badge({ label, color = 'slate' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorMap[color]}`}>
      {label}
    </span>
  );
}
