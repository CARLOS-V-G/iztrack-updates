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

export type CashClosureStatus = 'open' | 'closed';

export type AmountByPaymentMethod = Record<PaymentMethod, number>;

export interface CashClosure {
  id: string;
  close_date: string;
  counted: AmountByPaymentMethod;
  expected: AmountByPaymentMethod;
  total_sales: number;
  total_paid_expenses: number;
  total_pending_expenses: number;
  net_profit: number;
  difference: number;
  operator_name?: string;
  notes?: string;
  status: CashClosureStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  plu: string;
  name: string;
  price_per_kg?: number;
  active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScannerConfig {
  barcode_prefix: string;
  plu_start: number;
  plu_length: number;
  amount_start: number;
  amount_length: number;
  amount_divisor: number;
  auto_open_sale: boolean;
  bring_to_front: boolean;
  play_sound: boolean;
  default_payment_method: PaymentMethod | "";
  max_char_interval: number;
  min_code_length: number;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entity_id?: string;
  description?: string;
  created_at: string;
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

export type Page = 'dashboard' | 'sales' | 'expenses' | 'cash_closure' | 'reports' | 'charts' | 'settings';

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
