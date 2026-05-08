import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle,
  Clock,
  DollarSign,
  FileDown,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  DailySummary,
  Expense,
  ExpenseStatus,
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Sale,
} from "../lib/types";

import { formatCurrency, formatDate, formatDateShort, todayStr } from "../lib/utils";
import { exportDailyReportPDF } from "../lib/pdf-export";
import { Card } from "../components/ui/Card";
import { DonutChart } from "../components/charts/DonutChart";
import { PageHeader } from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

type Tone = "blue" | "green" | "red" | "amber" | "slate";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone: Tone;
  trend?: number;
}

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

const toneClasses: Record<Tone, { icon: string; value: string; bar: string }> = {
  blue: {
    icon: "bg-blue-100 text-blue-700",
    value: "text-blue-700",
    bar: "bg-blue-600",
  },
  green: {
    icon: "bg-green-100 text-green-700",
    value: "text-green-700",
    bar: "bg-green-600",
  },
  red: {
    icon: "bg-red-100 text-red-700",
    value: "text-red-700",
    bar: "bg-red-600",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700",
    value: "text-amber-700",
    bar: "bg-amber-500",
  },
  slate: {
    icon: "bg-slate-100 text-slate-700",
    value: "text-slate-900",
    bar: "bg-slate-500",
  },
};

function getDateKey(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function shiftDate(value: string, offsetDays: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPercentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function buildDailySummary(date: string, sales: Sale[], expenses: Expense[]): DailySummary {
  const daySales = sales.filter((sale) => getDateKey(sale.sale_date) === date && !sale.voided);
  const dayVoided = sales.filter((sale) => getDateKey(sale.sale_date) === date && sale.voided);
  const dayExpenses = expenses.filter((expense) => getDateKey(expense.expense_date) === date);

  const totalSales = daySales.reduce((sum, sale) => sum + Number(sale.amount), 0);
  const totalPaidExpenses = dayExpenses
    .filter((expense) => expense.status === "paid")
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const totalPendingExpenses = dayExpenses
    .filter((expense) => expense.status === "pending")
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  const salesByMethod = PAYMENT_METHODS.reduce(
    (acc, method) => {
      acc[method] = 0;
      return acc;
    },
    {} as Record<PaymentMethod, number>
  );

  for (const sale of daySales) {
    salesByMethod[sale.payment_method] += Number(sale.amount);
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

function MetricCard({ title, value, subtitle, icon, tone, trend }: MetricCardProps) {
  const classes = toneClasses[tone];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className={`text-2xl font-bold truncate ${classes.value}`}>{value}</p>
          <p className="text-xs text-slate-400 mt-1 truncate">{subtitle}</p>
          {trend !== undefined && (
            <p className={`text-xs font-semibold mt-2 ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
              {trend >= 0 ? "+" : ""}
              {formatPercent(trend)} vs dia anterior
            </p>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${classes.icon}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [allSales, allExpenses] = await Promise.all([
        window.api.getSales(),
        window.api.getExpenses(),
      ]);

      setSales((allSales || []) as Sale[]);
      setExpenses((allExpenses || []) as Expense[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const previousDate = useMemo(() => shiftDate(selectedDate, -1), [selectedDate]);

  const daySales = useMemo(
    () => sales.filter((sale) => getDateKey(sale.sale_date) === selectedDate),
    [sales, selectedDate]
  );

  const dayExpenses = useMemo(
    () => expenses.filter((expense) => getDateKey(expense.expense_date) === selectedDate),
    [expenses, selectedDate]
  );

  const summary = useMemo(
    () => buildDailySummary(selectedDate, sales, expenses),
    [expenses, sales, selectedDate]
  );

  const previousSummary = useMemo(
    () => buildDailySummary(previousDate, sales, expenses),
    [expenses, previousDate, sales]
  );

  const activeSales = useMemo(() => daySales.filter((sale) => !sale.voided), [daySales]);
  const voidedSales = useMemo(() => daySales.filter((sale) => sale.voided), [daySales]);

  const recentSales = useMemo(
    () =>
      [...daySales]
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, 6),
    [daySales]
  );

  const pendingExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.status === "pending")
        .sort((a, b) => {
          const dateDiff = getDateKey(a.expense_date).localeCompare(getDateKey(b.expense_date));
          if (dateDiff !== 0) return dateDiff;

          return Number(b.amount) - Number(a.amount);
        }),
    [expenses]
  );

  const paidDayExpenses = useMemo(
    () => dayExpenses.filter((expense) => expense.status === "paid"),
    [dayExpenses]
  );

  const pendingDayExpenses = useMemo(
    () => dayExpenses.filter((expense) => expense.status === "pending"),
    [dayExpenses]
  );

  const totalPendingGlobal = pendingExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );

  const projectedProfit = summary.netProfit - summary.totalPendingExpenses;
  const averageSale = summary.salesCount > 0 ? summary.totalSales / summary.salesCount : 0;
  const expenseRatio =
    summary.totalSales > 0 ? (summary.totalPaidExpenses / summary.totalSales) * 100 : 0;

  const salesTrend = getPercentChange(summary.totalSales, previousSummary.totalSales);
  const profitTrend = getPercentChange(summary.netProfit, previousSummary.netProfit);

  const paymentChartData = PAYMENT_METHODS.filter((method) => summary.salesByMethod[method] > 0).map(
    (method) => ({
      label: PAYMENT_METHOD_LABELS[method],
      value: summary.salesByMethod[method],
      color: PAYMENT_METHOD_COLORS[method],
    })
  );

  const topPaymentMethod = paymentChartData.reduce<(typeof paymentChartData)[number] | null>(
    (best, method) => (!best || method.value > best.value ? method : best),
    null
  );

  const recommendation = useMemo(() => {
    if (summary.salesCount === 0 && paidDayExpenses.length === 0 && pendingDayExpenses.length === 0) {
      return {
        tone: "blue" as Tone,
        title: "Empezar el dia",
        body: "Todavia no hay movimientos. Registra la primera venta o gasto para activar el resumen.",
      };
    }

    if (summary.netProfit < 0) {
      return {
        tone: "red" as Tone,
        title: "Revisar gastos pagados",
        body: "El dia esta en negativo. Mira los gastos pagados y evita cerrar sin revisar los montos fuertes.",
      };
    }

    if (projectedProfit < 0) {
      return {
        tone: "amber" as Tone,
        title: "Pendientes pueden dejar el dia negativo",
        body: "Si pagas todos los pendientes del dia, la ganancia proyectada queda por debajo de cero.",
      };
    }

    if (pendingExpenses.length > 0) {
      return {
        tone: "amber" as Tone,
        title: "Cerrar pendientes",
        body: "Hay gastos pendientes en la base. Conviene pagarlos o confirmarlos para que el tablero sea real.",
      };
    }

    if (summary.totalSales < previousSummary.totalSales) {
      return {
        tone: "blue" as Tone,
        title: "Ventas por debajo del dia anterior",
        body: "Las ventas bajaron contra el dia anterior. Revisa medios de pago y ticket promedio.",
      };
    }

    return {
      tone: "green" as Tone,
      title: "Dia saludable",
      body: "La ganancia esta positiva y no hay pendientes abiertos en el periodo seleccionado.",
    };
  }, [
    paidDayExpenses.length,
    pendingDayExpenses.length,
    pendingExpenses.length,
    previousSummary.totalSales,
    projectedProfit,
    summary.netProfit,
    summary.salesCount,
    summary.totalSales,
  ]);

  async function handleExportPDF() {
    await exportDailyReportPDF(selectedDate, summary, daySales, dayExpenses);
  }

  async function markExpensePaid(expense: Expense) {
    setPayingExpenseId(expense.id);

    try {
      const newStatus: ExpenseStatus = "paid";

      await window.api.toggleExpenseStatus({
        id: expense.id,
        status: newStatus,
      });

      setExpenses((current) =>
        current.map((item) =>
          item.id === expense.id
            ? {
                ...item,
                status: newStatus,
              }
            : item
        )
      );
    } finally {
      setPayingExpenseId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  const recommendationClasses =
    recommendation.tone === "red"
      ? "border-red-100 bg-red-50"
      : recommendation.tone === "amber"
        ? "border-amber-100 bg-amber-50"
        : recommendation.tone === "green"
          ? "border-green-100 bg-green-50"
          : "border-blue-100 bg-blue-50";

  const recommendationIconClasses =
    recommendation.tone === "red"
      ? "bg-red-600 text-white"
      : recommendation.tone === "amber"
        ? "bg-amber-500 text-white"
        : recommendation.tone === "green"
          ? "bg-green-600 text-white"
          : "bg-blue-600 text-white";

  return (
    <div>
      <PageHeader
        title="Panel Principal"
        subtitle={formatDate(selectedDate)}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(shiftDate(today, -1))}>
              Ayer
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(today)}>
              Hoy
            </Button>
            <Button variant="secondary" size="md" onClick={fetchData}>
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </Button>
            <Button onClick={handleExportPDF} variant="secondary" size="md">
              <FileDown className="w-4 h-4" />
              PDF
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <Card className={`p-5 border ${recommendationClasses}`}>
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${recommendationIconClasses}`}>
                {recommendation.tone === "green" ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recomendacion</p>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{recommendation.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{recommendation.body}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Cierre proyectado</p>
                <p className={`text-2xl font-bold ${projectedProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {formatCurrency(projectedProfit)}
                </p>
                <p className="text-xs text-slate-400 mt-1">Ganancia si se pagan pendientes del dia</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricCard
            title="Ventas del dia"
            value={formatCurrency(summary.totalSales)}
            subtitle={`${summary.salesCount} ventas activas`}
            icon={<ShoppingCart className="w-5 h-5" />}
            tone="blue"
            trend={salesTrend}
          />
          <MetricCard
            title="Gastos pagados"
            value={formatCurrency(summary.totalPaidExpenses)}
            subtitle={`${paidDayExpenses.length} gastos descontados`}
            icon={<Receipt className="w-5 h-5" />}
            tone="red"
          />
          <MetricCard
            title="Ganancia neta"
            value={formatCurrency(summary.netProfit)}
            subtitle={`${formatPercent(summary.totalSales > 0 ? (summary.netProfit / summary.totalSales) * 100 : 0)} margen`}
            icon={summary.netProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            tone={summary.netProfit >= 0 ? "green" : "red"}
            trend={profitTrend}
          />
          <MetricCard
            title="Pendientes globales"
            value={formatCurrency(totalPendingGlobal)}
            subtitle={`${pendingExpenses.length} gastos por resolver`}
            icon={<Clock className="w-5 h-5" />}
            tone={pendingExpenses.length > 0 ? "amber" : "green"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-6 items-start">
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="p-6">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Ventas por medio</h3>
                    <p className="text-xs text-slate-500 mt-1">Distribucion del dia seleccionado</p>
                  </div>
                  {topPaymentMethod && <Badge label={topPaymentMethod.label} color="blue" />}
                </div>
                {paymentChartData.length > 0 ? (
                  <DonutChart data={paymentChartData} size={178} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <DollarSign className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">Sin ventas registradas</p>
                  </div>
                )}
              </Card>

              <Card className="p-6 lg:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Rendimiento rapido</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Ticket promedio, gastos y movimientos del dia.
                    </p>
                  </div>
                  <Badge label={`${activeSales.length} activas`} color="green" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Ticket promedio</p>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(averageSale)}</p>
                    <p className="text-xs text-slate-400 mt-1">{summary.salesCount} ventas</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Gastos / ventas</p>
                    <p className={`text-lg font-bold ${expenseRatio >= 70 ? "text-amber-700" : "text-green-700"}`}>
                      {formatPercent(expenseRatio)}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${expenseRatio >= 70 ? "bg-amber-500" : "bg-green-600"}`}
                        style={{ width: `${Math.min(expenseRatio, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Anuladas</p>
                    <p className="text-lg font-bold text-slate-900">{voidedSales.length}</p>
                    <p className="text-xs text-slate-400 mt-1">Ventas canceladas</p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Comparacion con {formatDateShort(previousDate)}</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(summary.totalSales)} vs {formatCurrency(previousSummary.totalSales)}
                      </p>
                    </div>
                    <Badge label={`${salesTrend >= 0 ? "+" : ""}${formatPercent(salesTrend)}`} color={salesTrend >= 0 ? "green" : "red"} />
                  </div>
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Ultimas ventas del dia</h3>
                  <p className="text-xs text-slate-500 mt-1">Movimientos recientes de {formatDateShort(selectedDate)}.</p>
                </div>
                <Badge label={`${recentSales.length} visibles`} color="slate" />
              </div>

              {recentSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">Sin ventas registradas</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className={`flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors ${
                        sale.voided ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-2 h-9 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: sale.voided
                              ? "#cbd5e1"
                              : PAYMENT_METHOD_COLORS[sale.payment_method],
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {PAYMENT_METHOD_LABELS[sale.payment_method]}
                            </p>
                            {sale.voided && <Badge label="Anulada" color="red" />}
                          </div>
                          {sale.notes && <p className="text-xs text-slate-400 mt-1 truncate">{sale.notes}</p>}
                        </div>
                      </div>

                      <span className={`text-sm font-bold ${sale.voided ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {formatCurrency(Number(sale.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden xl:sticky xl:top-6">
            <div className="bg-amber-50 border-b border-amber-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-amber-700" />
                    <h3 className="font-semibold text-slate-900">Pendientes y control</h3>
                  </div>
                  <p className="text-xs text-amber-800 mt-1">Gastos abiertos de toda la base.</p>
                </div>
                <Badge label={`${pendingExpenses.length} activos`} color={pendingExpenses.length ? "amber" : "green"} />
              </div>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-amber-800">Total por pagar</p>
                  <p className="text-2xl font-bold text-amber-900">{formatCurrency(totalPendingGlobal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-800">Del dia</p>
                  <p className="text-sm font-semibold text-amber-900">
                    {formatCurrency(summary.totalPendingExpenses)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-b border-slate-100">
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Gastos del dia</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {paidDayExpenses.length} pagados / {pendingDayExpenses.length} pendientes
                    </p>
                  </div>
                  <Receipt className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="max-h-[56vh] overflow-y-auto scroll-pro">
              {pendingExpenses.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-25" />
                  <p className="text-sm">No hay pendientes abiertos.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {pendingExpenses.slice(0, 8).map((expense) => (
                    <div key={expense.id} className="p-5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{expense.concept}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatDateShort(getDateKey(expense.expense_date))}
                            {expense.category && ` - ${expense.category}`}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-amber-800 flex-shrink-0">
                          {formatCurrency(Number(expense.amount))}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="success"
                        className="w-full mt-3"
                        loading={payingExpenseId === expense.id}
                        onClick={() => markExpensePaid(expense)}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Marcar pagado
                      </Button>
                    </div>
                  ))}
                  {pendingExpenses.length > 8 && (
                    <p className="text-xs text-slate-400 text-center py-3">
                      Hay {pendingExpenses.length - 8} pendientes mas en Gastos.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
