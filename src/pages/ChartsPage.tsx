import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  Expense,
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Sale,
} from "../lib/types";

import {
  dateToStr,
  formatCurrency,
  formatDateLabel,
  formatDateShort,
  getMonthName,
  getMonthRange,
  getWeeksInRange,
  todayStr,
} from "../lib/utils";
import { getDatesInRange } from "../lib/calculations";
import { PageHeader } from "../components/Layout";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { BarChart } from "../components/charts/BarChart";
import { LineChart } from "../components/charts/LineChart";
import { DonutChart } from "../components/charts/DonutChart";

type ViewMode = "daily" | "weekly" | "monthly" | "annual";

type PeriodPoint = {
  key: string;
  label: string;
  rangeLabel: string;
  start: string;
  end: string;
  salesTotal: number;
  expenseTotal: number;
  profit: number;
  salesCount: number;
  expenseCount: number;
  averageTicket: number;
  margin: number;
};

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
const EXPENSE_COLORS = [
  "#dc2626",
  "#d97706",
  "#16a34a",
  "#0891b2",
  "#1d4ed8",
  "#7c3aed",
  "#db2777",
  "#65a30d",
];

const VIEW_LABELS: Record<ViewMode, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  annual: "Anual",
};

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function dateKey(value?: string) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function addDays(date: string, days: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setDate(current.getDate() + days);
  return dateToStr(current);
}

function diffDays(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000),
  );
}

function compactMoney(value: number) {
  return formatCurrency(value).replace("$ ", "$");
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function getChange(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function summarizeRange(
  start: string,
  end: string,
  sales: Sale[],
  expenses: Expense[],
): Omit<PeriodPoint, "key" | "label" | "rangeLabel" | "start" | "end"> {
  const periodSales = sales.filter(
    (sale) => !sale.voided && inRange(dateKey(sale.sale_date), start, end),
  );
  const periodExpenses = expenses.filter(
    (expense) =>
      expense.status === "paid" &&
      inRange(dateKey(expense.expense_date), start, end),
  );
  const salesTotal = periodSales.reduce(
    (sum, sale) => sum + toNumber(sale.amount),
    0,
  );
  const expenseTotal = periodExpenses.reduce(
    (sum, expense) => sum + toNumber(expense.amount),
    0,
  );
  const profit = salesTotal - expenseTotal;

  return {
    salesTotal,
    expenseTotal,
    profit,
    salesCount: periodSales.length,
    expenseCount: periodExpenses.length,
    averageTicket: periodSales.length ? salesTotal / periodSales.length : 0,
    margin: salesTotal ? (profit / salesTotal) * 100 : 0,
  };
}

function buildPeriodPoint(
  key: string,
  label: string,
  rangeLabel: string,
  start: string,
  end: string,
  sales: Sale[],
  expenses: Expense[],
): PeriodPoint {
  return {
    key,
    label,
    rangeLabel,
    start,
    end,
    ...summarizeRange(start, end, sales, expenses),
  };
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone,
  change,
}: {
  title: string;
  value: string;
  detail: string;
  icon: JSX.Element;
  tone: "blue" | "green" | "red" | "slate";
  change?: number | null;
}) {
  const iconGradients: Record<string, string> = {
    blue: "bg-gradient-to-br from-blue-500 to-blue-600",
    green: "bg-gradient-to-br from-green-500 to-green-600",
    red: "bg-gradient-to-br from-red-500 to-red-600",
    slate: "bg-gradient-to-br from-slate-500 to-slate-600",
  };
  const changePositive = change !== null && change !== undefined && change >= 0;

  return (
    <Card className="p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">
            {title}
          </p>
          <p className="text-xl font-bold text-slate-900 mt-1 truncate">
            {value}
          </p>
          <p className="text-xs text-slate-500 mt-1">{detail}</p>
          {change !== undefined && (
            <div className="mt-2">
              {change === null ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                  <Activity className="w-3.5 h-3.5" />
                  Sin base anterior
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  changePositive
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}>
                  {changePositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {formatPercent(change)}
                </span>
              )}
            </div>
          )}
        </div>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-sm ${iconGradients[tone]}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function ChartsPage() {
  const today = todayStr();
  const currentYear = parseInt(today.split("-")[0]);
  const currentMonth = parseInt(today.split("-")[1]);

  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [allSales, allExpenses] = await Promise.all([
      window.api.getSales(),
      window.api.getExpenses(),
    ]);

    setSales(allSales as Sale[]);
    setExpenses(allExpenses as Expense[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const years = useMemo(() => {
    const yearSet = new Set<number>();

    sales.forEach((sale) => {
      const year = Number(dateKey(sale.sale_date).slice(0, 4));
      if (year) yearSet.add(year);
    });
    expenses.forEach((expense) => {
      const year = Number(dateKey(expense.expense_date).slice(0, 4));
      if (year) yearSet.add(year);
    });
    yearSet.add(currentYear);

    return Array.from(yearSet).sort((a, b) => b - a);
  }, [currentYear, expenses, sales]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const periods = useMemo(() => {
    if (viewMode === "daily") {
      const { start, end } = getMonthRange(selectedYear, selectedMonth);
      return getDatesInRange(start, end).map((date) =>
        buildPeriodPoint(
          date,
          date.split("-")[2],
          formatDateLabel(date),
          date,
          date,
          sales,
          expenses,
        ),
      );
    }

    if (viewMode === "weekly") {
      const { start, end } = getMonthRange(selectedYear, selectedMonth);
      return getWeeksInRange(start, end).map((week, index) => {
        const weekStart = week.start < start ? start : week.start;
        const weekEnd = week.end > end ? end : week.end;

        return buildPeriodPoint(
          `week-${index + 1}`,
          `Sem ${index + 1}`,
          `${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`,
          weekStart,
          weekEnd,
          sales,
          expenses,
        );
      });
    }

    if (viewMode === "monthly") {
      return months.map((month) => {
        const { start, end } = getMonthRange(selectedYear, month);
        return buildPeriodPoint(
          `${selectedYear}-${month}`,
          getMonthName(month).slice(0, 3),
          getMonthName(month),
          start,
          end,
          sales,
          expenses,
        );
      });
    }

    return Array.from({ length: 5 }, (_, index) => selectedYear - 4 + index).map(
      (year) =>
        buildPeriodPoint(
          String(year),
          String(year),
          String(year),
          `${year}-01-01`,
          `${year}-12-31`,
          sales,
          expenses,
        ),
    );
  }, [expenses, months, sales, selectedMonth, selectedYear, viewMode]);

  const currentRange = useMemo(() => {
    const first = periods[0];
    const last = periods[periods.length - 1];
    return first && last ? { start: first.start, end: last.end } : null;
  }, [periods]);

  const summary = useMemo(() => {
    const salesTotal = periods.reduce((sum, item) => sum + item.salesTotal, 0);
    const expenseTotal = periods.reduce((sum, item) => sum + item.expenseTotal, 0);
    const profit = salesTotal - expenseTotal;
    const salesCount = periods.reduce((sum, item) => sum + item.salesCount, 0);
    const expenseCount = periods.reduce((sum, item) => sum + item.expenseCount, 0);

    return {
      salesTotal,
      expenseTotal,
      profit,
      salesCount,
      expenseCount,
      averageTicket: salesCount ? salesTotal / salesCount : 0,
      margin: salesTotal ? (profit / salesTotal) * 100 : 0,
    };
  }, [periods]);

  const previousSummary = useMemo(() => {
    if (!currentRange) return null;

    const length = diffDays(currentRange.start, currentRange.end);
    const prevEnd = addDays(currentRange.start, -1);
    const prevStart = addDays(prevEnd, -length);

    return summarizeRange(prevStart, prevEnd, sales, expenses);
  }, [currentRange, expenses, sales]);

  const activePeriods = periods.filter(
    (period) => period.salesTotal > 0 || period.expenseTotal > 0,
  );
  const chartPeriods = viewMode === "daily" ? activePeriods : periods;
  const bestProfitPeriod = activePeriods.reduce<PeriodPoint | null>(
    (best, period) => (!best || period.profit > best.profit ? period : best),
    null,
  );
  const bestSalesPeriod = activePeriods.reduce<PeriodPoint | null>(
    (best, period) =>
      !best || period.salesTotal > best.salesTotal ? period : best,
    null,
  );
  const weakestPeriod = activePeriods.reduce<PeriodPoint | null>(
    (weakest, period) =>
      !weakest || period.profit < weakest.profit ? period : weakest,
    null,
  );

  const paymentMethodData = useMemo(() => {
    if (!currentRange) return [];

    return PAYMENT_METHODS.map((method) => ({
      label: PAYMENT_METHOD_LABELS[method],
      value: sales
        .filter(
          (sale) =>
            !sale.voided &&
            sale.payment_method === method &&
            inRange(dateKey(sale.sale_date), currentRange.start, currentRange.end),
        )
        .reduce((sum, sale) => sum + toNumber(sale.amount), 0),
      color: PAYMENT_METHOD_COLORS[method],
    })).filter((item) => item.value > 0);
  }, [currentRange, sales]);

  const categoryChartData = useMemo(() => {
    if (!currentRange) return [];

    const totals = expenses
      .filter(
        (expense) =>
          expense.status === "paid" &&
          inRange(
            dateKey(expense.expense_date),
            currentRange.start,
            currentRange.end,
          ),
      )
      .reduce(
        (acc, expense) => {
          const category = expense.category || expense.concept || "Sin categoria";
          acc[category] = (acc[category] || 0) + toNumber(expense.amount);
          return acc;
        },
        {} as Record<string, number>,
      );

    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], index) => ({
        label,
        value,
        color: EXPENSE_COLORS[index % EXPENSE_COLORS.length],
      }));
  }, [currentRange, expenses]);

  const salesBarData = chartPeriods.map((period) => ({
    label: period.label,
    value: period.salesTotal,
    color: "#1d4ed8",
  }));

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Graficos y Analisis"
          subtitle="Comparacion diaria, semanal, mensual y anual"
          actions={
            <Button variant="secondary" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          }
        />

        <div className="p-8 space-y-6 animate-fade-in">
          <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
            <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="h-52 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
            <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Graficos y Analisis"
        subtitle="Comparacion diaria, semanal, mensual y anual"
        actions={
          <Button variant="secondary" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        }
      />

      <div className="p-8 space-y-6 animate-fade-in">
        <Card className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                        viewMode === mode
                          ? "border-transparent bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-sm"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                >
                  {VIEW_LABELS[mode]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              {(viewMode === "daily" || viewMode === "weekly") && (
                <div className="relative">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {getMonthName(month)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              )}

              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {viewMode === "annual" ? `Hasta ${year}` : year}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
            <MetricCard
              title="Ventas"
              value={compactMoney(summary.salesTotal)}
              detail={`${summary.salesCount} operaciones`}
              icon={<DollarSign className="w-5 h-5" />}
              tone="blue"
              change={getChange(
                summary.salesTotal,
                previousSummary?.salesTotal || 0,
              )}
            />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            <MetricCard
              title="Gastos pagos"
              value={compactMoney(summary.expenseTotal)}
              detail={`${summary.expenseCount} registros`}
              icon={<Wallet className="w-5 h-5" />}
              tone="red"
              change={getChange(
                summary.expenseTotal,
                previousSummary?.expenseTotal || 0,
              )}
            />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
            <MetricCard
              title="Ganancia"
              value={compactMoney(summary.profit)}
              detail={`${formatPercent(summary.margin)} de margen`}
              icon={<TrendingUp className="w-5 h-5" />}
              tone={summary.profit >= 0 ? "green" : "red"}
              change={getChange(summary.profit, previousSummary?.profit || 0)}
            />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '300ms' }}>
            <MetricCard
              title="Ticket promedio"
              value={compactMoney(summary.averageTicket)}
              detail={`${activePeriods.length} periodos con movimiento`}
              icon={<CalendarDays className="w-5 h-5" />}
              tone="slate"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="animate-scale-in" style={{ animationDelay: '400ms' }}>
            <Card className="p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Evolucion comparativa
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ventas, gastos pagos y ganancia por {VIEW_LABELS[viewMode].toLowerCase()}
                    </p>
                  </div>
                </div>
              </div>

              {chartPeriods.length > 0 ? (
                <LineChart
                  labels={chartPeriods.map((period) => period.label)}
                  series={[
                    {
                      label: "Ventas",
                      values: chartPeriods.map((period) => period.salesTotal),
                      color: "#1d4ed8",
                    },
                    {
                      label: "Gastos",
                      values: chartPeriods.map((period) => period.expenseTotal),
                      color: "#dc2626",
                    },
                    {
                      label: "Ganancia",
                      values: chartPeriods.map((period) => period.profit),
                      color: "#16a34a",
                    },
                  ]}
                  height={280}
                />
              ) : (
                <div className="flex items-center justify-center h-52 text-slate-400 text-sm">
                  Sin datos para comparar
                </div>
              )}
            </Card>
          </div>

          <div className="animate-scale-in" style={{ animationDelay: '500ms' }}>
            <Card className="p-6 space-y-4 hover:shadow-lg transition-all duration-300">
              <h3 className="text-base font-semibold text-slate-900">
                Lectura rapida
              </h3>

              <div className="space-y-3">
                <div className="rounded-xl bg-green-50 border border-green-100 p-4">
                  <p className="text-xs text-green-700 font-medium">
                    Mejor ganancia
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {bestProfitPeriod
                      ? `${bestProfitPeriod.rangeLabel} - ${compactMoney(bestProfitPeriod.profit)}`
                      : "Sin datos"}
                  </p>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                  <p className="text-xs text-blue-700 font-medium">
                    Mayor venta
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {bestSalesPeriod
                      ? `${bestSalesPeriod.rangeLabel} - ${compactMoney(bestSalesPeriod.salesTotal)}`
                      : "Sin datos"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 font-medium">
                    Punto mas bajo
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {weakestPeriod
                      ? `${weakestPeriod.rangeLabel} - ${compactMoney(weakestPeriod.profit)}`
                      : "Sin datos"}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="animate-scale-in" style={{ animationDelay: '400ms' }}>
            <Card className="p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  Ventas por periodo
                </h3>
              </div>
              {salesBarData.some((item) => item.value > 0) ? (
                <BarChart data={salesBarData} height={220} />
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                  Sin ventas en el periodo
                </div>
              )}
            </Card>
          </div>

          <div className="animate-scale-in" style={{ animationDelay: '500ms' }}>
            <Card className="p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-sm">
                  <DollarSign className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  Ventas por medio de pago
                </h3>
              </div>
              <DonutChart data={paymentMethodData} size={180} />
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="animate-scale-in" style={{ animationDelay: '400ms' }}>
            <Card className="p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-sm">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Comparacion detallada
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {periods.length} periodos
                </span>
              </div>
              <div className="max-h-[460px] overflow-auto scroll-pro pr-1">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="text-left py-3 pr-4 font-medium">Periodo</th>
                      <th className="text-right py-3 px-4 font-medium">Ventas</th>
                      <th className="text-right py-3 px-4 font-medium">Gastos</th>
                      <th className="text-right py-3 px-4 font-medium">Ganancia</th>
                      <th className="text-right py-3 px-4 font-medium">Ticket</th>
                      <th className="text-right py-3 pl-4 font-medium">Vs ant.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periods.map((period, index) => {
                      const previous = periods[index - 1];
                      const change = previous
                        ? getChange(period.salesTotal, previous.salesTotal)
                        : null;

                      return (
                        <tr key={period.key} className="hover:bg-slate-50 transition-all duration-150">
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-800">
                              {period.rangeLabel}
                            </p>
                            <p className="text-xs text-slate-400">
                              {period.salesCount} ventas - {period.expenseCount} gastos
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-blue-700">
                            {compactMoney(period.salesTotal)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-red-700">
                            {compactMoney(period.expenseTotal)}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-semibold ${
                              period.profit >= 0 ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {compactMoney(period.profit)}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-700">
                            {compactMoney(period.averageTicket)}
                          </td>
                          <td
                            className={`py-3 pl-4 text-right font-medium ${
                              change === null
                                ? "text-slate-400"
                                : change >= 0
                                  ? "text-green-700"
                                  : "text-red-700"
                            }`}
                          >
                            {change === null ? "-" : formatPercent(change)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="animate-scale-in" style={{ animationDelay: '500ms' }}>
            <Card className="p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                  <Wallet className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  Gastos por categoria
                </h3>
              </div>
              {categoryChartData.length > 0 ? (
                <BarChart
                  data={categoryChartData}
                  height={240}
                  formatValue={(value) => compactMoney(value)}
                />
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                  Sin gastos en el periodo
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
