export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'transfer' | 'digital_wallet';
export type ExpenseStatus = 'paid' | 'pending';

export interface Sale {
  id: string;
  sale_date: string;
  amount: number;
  payment_method: PaymentMethod;
  notes?: string;
  voided: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  concept: string;
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  status: ExpenseStatus;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  netProfit: number;
  salesByMethod: Record<PaymentMethod, number>;
  salesCount: number;
  voidedCount: number;
}

export interface PeriodSummary {
  label: string;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalPaidExpenses: number;
  netProfit: number;
  salesCount: number;
  expensesCount: number;
}

export type Page = 'dashboard' | 'sales' | 'expenses' | 'reports' | 'charts' | 'settings';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferencia',
  digital_wallet: 'Billetera Digital',
};

export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  cash: '#16a34a',
  debit: '#2563eb',
  credit: '#d97706',
  transfer: '#0891b2',
  digital_wallet: '#7c3aed',
};

export const EXPENSE_CATEGORIES = [
  'Insumos / Alimentos',
  'Servicios (luz, agua, gas)',
  'Alquiler',
  'Personal / Sueldos',
  'Mantenimiento',
  'Marketing / Publicidad',
  'Transporte',
  'Impuestos / Tasas',
  'Equipamiento',
  'Otros',
];
