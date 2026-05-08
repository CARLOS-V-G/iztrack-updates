import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  Clock,
  FileDown,
  FileText,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import jsPDF from "jspdf";

import { Expense, Sale } from "../lib/types";
import {
  formatCurrency,
  formatDate,
  formatDateShort,
  getMonthName,
  getMonthRange,
  getWeeksInRange,
  todayStr,
} from "../lib/utils";
import { PageHeader } from "../components/Layout";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import {
  PDF_COLORS,
  addPdfFooter,
  addPdfHeader,
  addSectionTitle,
  addSummaryCards,
} from "../lib/pdfTheme";

type ReportView = "diario" | "semanal" | "mensual" | "anual";
type Tone = "blue" | "green" | "red" | "amber" | "slate";

interface ReportRow {
  label: string;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  netProfit: number;
  salesCount: number;
  paidExpensesCount: number;
  pendingExpensesCount: number;
  margin: number;
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone: Tone;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const toneClasses: Record<Tone, { icon: string; value: string }> = {
  blue: {
    icon: "bg-blue-100 text-blue-700",
    value: "text-blue-700",
  },
  green: {
    icon: "bg-green-100 text-green-700",
    value: "text-green-700",
  },
  red: {
    icon: "bg-red-100 text-red-700",
    value: "text-red-700",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700",
    value: "text-amber-700",
  },
  slate: {
    icon: "bg-slate-100 text-slate-700",
    value: "text-slate-900",
  },
};

function getDateKey(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function isInRange(value: string | undefined, startDate: string, endDate: string) {
  const date = getDateKey(value);
  return date >= startDate && date <= endDate;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function shiftDate(value: string, offsetDays: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildReportRow(
  label: string,
  startDate: string,
  endDate: string,
  sales: Sale[],
  expenses: Expense[]
): ReportRow {
  const periodSales = sales.filter(
    (sale) => !sale.voided && isInRange(sale.sale_date, startDate, endDate)
  );
  const periodExpenses = expenses.filter((expense) =>
    isInRange(expense.expense_date, startDate, endDate)
  );
  const paidExpenses = periodExpenses.filter((expense) => expense.status === "paid");
  const pendingExpenses = periodExpenses.filter((expense) => expense.status === "pending");

  const totalSales = periodSales.reduce((sum, sale) => sum + Number(sale.amount), 0);
  const totalPaidExpenses = paidExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );
  const totalPendingExpenses = pendingExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );
  const netProfit = totalSales - totalPaidExpenses;

  return {
    label,
    startDate,
    endDate,
    totalSales,
    totalPaidExpenses,
    totalPendingExpenses,
    netProfit,
    salesCount: periodSales.length,
    paidExpensesCount: paidExpenses.length,
    pendingExpensesCount: pendingExpenses.length,
    margin: totalSales > 0 ? (netProfit / totalSales) * 100 : 0,
  };
}

function StatCard({ title, value, subtitle, icon, tone }: StatCardProps) {
  const classes = toneClasses[tone];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${classes.icon}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className={`text-xl font-bold truncate ${classes.value}`}>{value}</p>
          <p className="text-xs text-slate-400 truncate">{subtitle}</p>
        </div>
      </div>
    </Card>
  );
}

export function ReportsPage() {
  const today = todayStr();
  const currentYear = Number(today.split("-")[0]);
  const currentMonth = Number(today.split("-")[1]);

  const [view, setView] = useState<ReportView>("semanal");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const years = useMemo(
    () => Array.from({ length: 7 }, (_, index) => currentYear - index),
    [currentYear]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [allSales, allExpenses] = await Promise.all([
        window.api.getSales(),
        window.api.getExpenses(),
      ]);

      setSales((allSales || []) as Sale[]);
      setExpenses((allExpenses || []) as Expense[]);
    } catch (error) {
      console.error("ERROR REPORTS:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const monthRange = useMemo(
    () => getMonthRange(selectedYear, selectedMonth),
    [selectedMonth, selectedYear]
  );

  const weeks = useMemo(
    () => getWeeksInRange(monthRange.start, monthRange.end),
    [monthRange.end, monthRange.start]
  );

  const annualYears = useMemo(
    () => Array.from({ length: 5 }, (_, index) => selectedYear - 4 + index),
    [selectedYear]
  );

  const data = useMemo(() => {
    if (view === "diario") {
      return [
        buildReportRow(formatDate(selectedDate), selectedDate, selectedDate, sales, expenses),
      ];
    }

    if (view === "semanal") {
      return weeks.map((week) =>
        buildReportRow(week.label, week.start, week.end, sales, expenses)
      );
    }

    if (view === "mensual") {
      return MONTHS.map((month) => {
        const range = getMonthRange(selectedYear, month);
        return buildReportRow(getMonthName(month), range.start, range.end, sales, expenses);
      });
    }

    return annualYears.map((year) =>
      buildReportRow(
        String(year),
        `${year}-01-01`,
        `${year}-12-31`,
        sales,
        expenses
      )
    );
  }, [annualYears, expenses, sales, selectedDate, selectedYear, view, weeks]);

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, row) => ({
          sales: acc.sales + row.totalSales,
          paidExpenses: acc.paidExpenses + row.totalPaidExpenses,
          pendingExpenses: acc.pendingExpenses + row.totalPendingExpenses,
          profit: acc.profit + row.netProfit,
          salesCount: acc.salesCount + row.salesCount,
          paidExpensesCount: acc.paidExpensesCount + row.paidExpensesCount,
          pendingExpensesCount: acc.pendingExpensesCount + row.pendingExpensesCount,
        }),
        {
          sales: 0,
          paidExpenses: 0,
          pendingExpenses: 0,
          profit: 0,
          salesCount: 0,
          paidExpensesCount: 0,
          pendingExpensesCount: 0,
        }
      ),
    [data]
  );

  const activeRows = useMemo(
    () =>
      data.filter(
        (row) =>
          row.totalSales > 0 ||
          row.totalPaidExpenses > 0 ||
          row.totalPendingExpenses > 0
      ),
    [data]
  );

  const bestRow = useMemo(
    () =>
      activeRows.reduce<ReportRow | null>(
        (best, row) => (!best || row.netProfit > best.netProfit ? row : best),
        null
      ),
    [activeRows]
  );

  const weakestRow = useMemo(
    () =>
      activeRows.reduce<ReportRow | null>(
        (weakest, row) => (!weakest || row.netProfit < weakest.netProfit ? row : weakest),
        null
      ),
    [activeRows]
  );

  const pendingRows = useMemo(
    () =>
      data
        .filter((row) => row.totalPendingExpenses > 0)
        .sort((a, b) => b.totalPendingExpenses - a.totalPendingExpenses),
    [data]
  );

  const maxSales = Math.max(...data.map((row) => row.totalSales), 1);
  const maxPaidExpenses = Math.max(...data.map((row) => row.totalPaidExpenses), 1);
  const margin = totals.sales > 0 ? (totals.profit / totals.sales) * 100 : 0;
  const expenseRatio = totals.sales > 0 ? (totals.paidExpenses / totals.sales) * 100 : 0;

  const periodTitle =
    view === "diario"
      ? `Reporte diario - ${formatDate(selectedDate)}`
      : view === "semanal"
      ? `Semanas de ${getMonthName(selectedMonth)} ${selectedYear}`
      : view === "mensual"
        ? `Mes a mes de ${selectedYear}`
        : `Comparacion anual ${annualYears[0]} - ${annualYears[annualYears.length - 1]}`;

  const recommendation = useMemo(() => {
    if (activeRows.length === 0) {
      return {
        title: "Sin datos cargados",
        body: "No hay ventas ni gastos para comparar en este reporte.",
        tone: "slate" as Tone,
      };
    }

    if (totals.profit < 0) {
      return {
        title: "Revisar gastos",
        body: "La ganancia esta negativa. Conviene revisar los gastos pagados del periodo mas flojo.",
        tone: "red" as Tone,
      };
    }

    if (totals.pendingExpenses > 0) {
      return {
        title: "Pendientes a controlar",
        body: "Hay gastos pendientes que todavia no bajan la ganancia. Revisalos antes de cerrar el reporte.",
        tone: "amber" as Tone,
      };
    }

    if (expenseRatio >= 70) {
      return {
        title: "Gastos altos",
        body: "Los gastos pagados consumen mas del 70% de las ventas. Mira el detalle por periodo.",
        tone: "amber" as Tone,
      };
    }

    return {
      title: "Reporte saludable",
      body: "La ganancia esta positiva y no hay pendientes dentro del periodo analizado.",
      tone: "green" as Tone,
    };
  }, [activeRows.length, expenseRatio, totals.pendingExpenses, totals.profit]);

  const handlePrint = () => window.print();

  async function generatePDF() {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const colWidths = [58, 36, 36, 36, 36, 26, 24];
    const startX = 14;

    const title =
      view === "diario"
        ? "Reporte diario"
        : view === "semanal"
        ? "Reporte semanal"
        : view === "mensual"
          ? "Reporte mensual"
          : "Reporte anual";

    let yPos = await addPdfHeader(
      doc,
      title,
      periodTitle,
      "izTrack Reportes",
    );

    yPos = addSummaryCards(doc, [
      {
        label: "Ventas",
        value: formatCurrency(totals.sales),
        color: PDF_COLORS.blue700,
      },
      {
        label: "Gastos pagados",
        value: formatCurrency(totals.paidExpenses),
        color: PDF_COLORS.red600,
      },
      {
        label: "Pendientes",
        value: formatCurrency(totals.pendingExpenses),
        color: PDF_COLORS.amber600,
      },
      {
        label: "Ganancia",
        value: formatCurrency(totals.profit),
        color: totals.profit >= 0 ? PDF_COLORS.green600 : PDF_COLORS.red600,
      },
    ], yPos);

    yPos = addSectionTitle(doc, "Detalle financiero", yPos);

    const headers = ["Periodo", "Ventas", "Gastos pag.", "Pendientes", "Ganancia", "Margen", "Mov."];

    const drawHeader = () => {
      doc.setFillColor(PDF_COLORS.slate100[0], PDF_COLORS.slate100[1], PDF_COLORS.slate100[2]);
      doc.roundedRect(startX, yPos - 5, pageWidth - startX * 2, 8, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(PDF_COLORS.slate500[0], PDF_COLORS.slate500[1], PDF_COLORS.slate500[2]);

      headers.forEach((header, index) => {
        const x = startX + colWidths.slice(0, index).reduce((sum, width) => sum + width, 0) + 2;
        doc.text(header, x, yPos);
      });

      yPos += 9;
    };

    drawHeader();

    data.forEach((row) => {
      if (yPos > 190) {
        doc.addPage();
        yPos = 18;
        drawHeader();
      }

      const values = [
        row.label,
        formatCurrency(row.totalSales),
        formatCurrency(row.totalPaidExpenses),
        formatCurrency(row.totalPendingExpenses),
        formatCurrency(row.netProfit),
        formatPercent(row.margin),
        String(row.salesCount + row.paidExpensesCount + row.pendingExpensesCount),
      ];

      values.forEach((value, index) => {
        const x = startX + colWidths.slice(0, index).reduce((sum, width) => sum + width, 0) + 2;

        if (index === 4) {
          doc.setTextColor(row.netProfit >= 0 ? 22 : 220, row.netProfit >= 0 ? 163 : 38, 74);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(50, 50, 50);
          doc.setFont("helvetica", index === 0 ? "bold" : "normal");
        }

        doc.text(String(value), x, yPos, { maxWidth: colWidths[index] - 3 });
      });

      yPos += 6;
    });

    yPos += 3;
    doc.setFillColor(PDF_COLORS.slate950[0], PDF_COLORS.slate950[1], PDF_COLORS.slate950[2]);
    doc.roundedRect(startX, yPos, pageWidth - startX * 2, 10, 2, 2, "F");
    yPos += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTALES", startX + 2, yPos);
    doc.text(formatCurrency(totals.sales), startX + colWidths[0] + 2, yPos);
    doc.text(
      formatCurrency(totals.paidExpenses),
      startX + colWidths[0] + colWidths[1] + 2,
      yPos
    );
    doc.text(
      formatCurrency(totals.pendingExpenses),
      startX + colWidths[0] + colWidths[1] + colWidths[2] + 2,
      yPos
    );
    doc.text(
      formatCurrency(totals.profit),
      startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2,
      yPos
    );

    addPdfFooter(doc, "izTrack - Reporte financiero");

    const suffix =
      view === "diario"
        ? selectedDate
        : view === "semanal"
        ? `${selectedYear}_${String(selectedMonth).padStart(2, "0")}`
        : String(selectedYear);
    doc.save(`reporte_${view}_${suffix}.pdf`);
  }

  function renderRow(row: ReportRow, index: number) {
    const salesWidth = row.totalSales > 0 ? Math.max(6, (row.totalSales / maxSales) * 100) : 0;
    const expensesWidth =
      row.totalPaidExpenses > 0
        ? Math.max(6, (row.totalPaidExpenses / maxPaidExpenses) * 100)
        : 0;
    const movementCount = row.salesCount + row.paidExpensesCount + row.pendingExpensesCount;

    return (
      <tr key={`${row.label}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
        <td className="px-5 py-4 align-top">
          <p className="text-sm font-semibold text-slate-800 max-w-xs truncate">{row.label}</p>
          <p className="text-xs text-slate-400 mt-1">
            {formatDateShort(row.startDate)} - {formatDateShort(row.endDate)}
          </p>
        </td>
        <td className="px-5 py-4 text-right align-top">
          <p className="text-sm font-bold text-blue-700">{formatCurrency(row.totalSales)}</p>
          <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${salesWidth}%` }} />
          </div>
        </td>
        <td className="px-5 py-4 text-right align-top">
          <p className="text-sm font-bold text-red-600">{formatCurrency(row.totalPaidExpenses)}</p>
          <div className="mt-2 h-1.5 rounded-full bg-red-100 overflow-hidden">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${expensesWidth}%` }} />
          </div>
        </td>
        <td className="px-5 py-4 text-right align-top">
          <p className="text-sm font-bold text-amber-700">{formatCurrency(row.totalPendingExpenses)}</p>
          <p className="text-xs text-slate-400 mt-1">{row.pendingExpensesCount} pendientes</p>
        </td>
        <td className="px-5 py-4 text-right align-top">
          <p className={`text-sm font-bold ${row.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
            {formatCurrency(row.netProfit)}
          </p>
          <p className="text-xs text-slate-400 mt-1">{formatPercent(row.margin)} margen</p>
        </td>
        <td className="px-5 py-4 text-right align-top">
          <p className="text-sm font-semibold text-slate-700">{movementCount}</p>
          <p className="text-xs text-slate-400 mt-1">{row.salesCount} ventas</p>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Resumen financiero con comparativas y pendientes"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button variant="secondary" onClick={generatePDF}>
              <FileDown className="w-4 h-4" />
              PDF
            </Button>
            <Button variant="secondary" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6 print-content">
        <div className="flex flex-wrap gap-3 items-center no-print">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(["diario", "semanal", "mensual", "anual"] as ReportView[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === option
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option === "diario"
                  ? "Diario"
                  : option === "semanal"
                    ? "Semanal"
                    : option === "mensual"
                      ? "Mensual"
                      : "Anual"}
              </button>
            ))}
          </div>

          {view === "diario" && (
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
          )}

          {view === "semanal" && (
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(Number(event.target.value))}
                className="appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {getMonthName(month)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}

          {view !== "diario" && (
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="appearance-none border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            title="Ventas"
            value={formatCurrency(totals.sales)}
            subtitle={`${totals.salesCount} ventas validas`}
            icon={<TrendingUp className="w-5 h-5" />}
            tone="blue"
          />
          <StatCard
            title="Gastos pagados"
            value={formatCurrency(totals.paidExpenses)}
            subtitle={`${totals.paidExpensesCount} gastos descontados`}
            icon={<TrendingDown className="w-5 h-5" />}
            tone="red"
          />
          <StatCard
            title="Ganancia neta"
            value={formatCurrency(totals.profit)}
            subtitle={`${formatPercent(margin)} margen del periodo`}
            icon={<BarChart3 className="w-5 h-5" />}
            tone={totals.profit >= 0 ? "green" : "red"}
          />
          <StatCard
            title="Pendiente"
            value={formatCurrency(totals.pendingExpenses)}
            subtitle={`${totals.pendingExpensesCount} gastos sin pagar`}
            icon={<Clock className="w-5 h-5" />}
            tone={totals.pendingExpenses > 0 ? "amber" : "green"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-6 items-start">
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {periodTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Ventas, gastos pagados, pendientes y margen por periodo.
                </p>
              </div>
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400 flex-shrink-0" />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Periodo
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Ventas
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Gastos
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Pendientes
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Ganancia
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Mov.
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.map((row, index) => renderRow(row, index))}
                  {data.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                        Sin datos para el periodo seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-900 text-white">
                      <td className="px-5 py-4 text-sm font-bold">TOTAL</td>
                      <td className="px-5 py-4 text-sm font-bold text-right">
                        {formatCurrency(totals.sales)}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-right text-red-300">
                        {formatCurrency(totals.paidExpenses)}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-right text-amber-300">
                        {formatCurrency(totals.pendingExpenses)}
                      </td>
                      <td
                        className={`px-5 py-4 text-sm font-bold text-right ${
                          totals.profit >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(totals.profit)}
                      </td>
                      <td className="px-5 py-4 text-sm text-right text-slate-400">
                        {totals.salesCount + totals.paidExpensesCount + totals.pendingExpensesCount}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden xl:sticky xl:top-6 no-print">
            <div className="p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-700" />
                    <h3 className="font-semibold text-slate-900">Resumen del reporte</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Lectura rapida y recomendaciones del periodo.
                  </p>
                </div>
                <Badge label={view.toUpperCase()} color="blue" />
              </div>
            </div>

            <div className="p-5 border-b border-slate-100">
              <div
                className={`rounded-xl border px-4 py-3 ${
                  recommendation.tone === "red"
                    ? "border-red-100 bg-red-50"
                    : recommendation.tone === "amber"
                      ? "border-amber-100 bg-amber-50"
                      : recommendation.tone === "green"
                        ? "border-green-100 bg-green-50"
                        : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      recommendation.tone === "red"
                        ? "bg-red-600 text-white"
                        : recommendation.tone === "amber"
                          ? "bg-amber-500 text-white"
                          : recommendation.tone === "green"
                            ? "bg-green-600 text-white"
                            : "bg-slate-600 text-white"
                    }`}
                  >
                    {recommendation.tone === "green" ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Recomendado
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {recommendation.title}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{recommendation.body}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 border-b border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 px-3 py-3">
                  <p className="text-xs text-slate-500">Mejor periodo</p>
                  <p className="text-sm font-semibold text-green-700 truncate">
                    {bestRow ? bestRow.label : "-"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {bestRow ? formatCurrency(bestRow.netProfit) : formatCurrency(0)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 px-3 py-3">
                  <p className="text-xs text-slate-500">A revisar</p>
                  <p className="text-sm font-semibold text-red-600 truncate">
                    {weakestRow ? weakestRow.label : "-"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {weakestRow ? formatCurrency(weakestRow.netProfit) : formatCurrency(0)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Relacion gastos / ventas</p>
                  <Badge
                    label={formatPercent(expenseRatio)}
                    color={expenseRatio >= 70 ? "amber" : "green"}
                  />
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${expenseRatio >= 70 ? "bg-amber-500" : "bg-green-600"}`}
                    style={{ width: `${Math.min(expenseRatio, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-700" />
                  <h4 className="text-sm font-semibold text-slate-900">Pendientes del reporte</h4>
                </div>
                <Badge
                  label={`${totals.pendingExpensesCount} activos`}
                  color={totals.pendingExpensesCount > 0 ? "amber" : "green"}
                />
              </div>

              {pendingRows.length === 0 ? (
                <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-700 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900">Sin pendientes</p>
                    <p className="text-xs text-green-700">El periodo esta limpio para cerrar.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRows.slice(0, 5).map((row) => (
                    <div
                      key={`${row.label}-pending`}
                      className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{row.label}</p>
                          <p className="text-xs text-amber-800 mt-1">
                            {row.pendingExpensesCount} gastos sin pagar
                          </p>
                        </div>
                        <p className="text-sm font-bold text-amber-900 flex-shrink-0">
                          {formatCurrency(row.totalPendingExpenses)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {pendingRows.length > 5 && (
                    <p className="text-xs text-slate-400 text-center pt-1">
                      Hay {pendingRows.length - 5} periodos pendientes mas.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          body { background: white; }
          .shadow-sm { box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
