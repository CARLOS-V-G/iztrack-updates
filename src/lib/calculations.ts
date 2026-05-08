import { Sale, Expense, DailySummary, PaymentMethod } from './types';

export function computeDailySummary(date: string, sales: Sale[], expenses: Expense[]): DailySummary {
  const daySales = sales.filter(s => s.sale_date === date && !s.voided);
  const dayVoided = sales.filter(s => s.sale_date === date && s.voided);
  const dayExpenses = expenses.filter(e => e.expense_date === date);

  const totalSales = daySales.reduce((sum, s) => sum + s.amount, 0);
  const totalPaidExpenses = dayExpenses.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0);
  const totalPendingExpenses = dayExpenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);

  const salesByMethod: Record<PaymentMethod, number> = {
    cash: 0,
    debit: 0,
    credit: 0,
    transfer: 0,
    digital_wallet: 0,
  };

  for (const sale of daySales) {
    salesByMethod[sale.payment_method] += sale.amount;
  }

  return {
    date,
    totalSales,
    totalPaidExpenses,
    totalPendingExpenses,
    netProfit: totalSales - totalPaidExpenses,
    salesByMethod,
    salesCount: daySales.length,
    voidedCount: dayVoided.length,
  };
}

export function computePeriodSummary(
  label: string,
  startDate: string,
  endDate: string,
  sales: Sale[],
  expenses: Expense[]
) {
  const periodSales = sales.filter(s => s.sale_date >= startDate && s.sale_date <= endDate && !s.voided);
  const periodExpenses = expenses.filter(e => e.expense_date >= startDate && e.expense_date <= endDate);

  const totalSales = periodSales.reduce((sum, s) => sum + s.amount, 0);
  const totalPaidExpenses = periodExpenses.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0);

  return {
    label,
    startDate,
    endDate,
    totalSales,
    totalPaidExpenses,
    netProfit: totalSales - totalPaidExpenses,
    salesCount: periodSales.length,
    expensesCount: periodExpenses.length,
  };
}

export function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
