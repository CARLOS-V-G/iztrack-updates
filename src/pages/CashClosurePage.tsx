import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Calculator,
  Download,
  Package,
  RefreshCw,
  Save,
  Settings,
  Trash2,
} from "lucide-react";

import {
  AmountByPaymentMethod,
  AuditLog,
  CashClosure,
  Expense,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Product,
  Sale,
  ScannerConfig,
} from "../lib/types";
import { DEFAULT_SCANNER_CONFIG } from "../lib/scaleBarcode";
import { formatCurrency, formatDate, formatDateShort, todayStr } from "../lib/utils";
import { PageHeader } from "../components/Layout";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

const emptyAmounts = PAYMENT_METHODS.reduce((acc, method) => {
  acc[method] = 0;
  return acc;
}, {} as AmountByPaymentMethod);

const emptyProductForm = {
  plu: "",
  name: "",
  price_per_kg: "",
  notes: "",
};

type ProductForm = typeof emptyProductForm;

function getDateKey(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function formatInputAmount(value: number) {
  return Number.isFinite(value) && value !== 0 ? String(value) : "";
}

function sumAmounts(amounts: AmountByPaymentMethod) {
  return PAYMENT_METHODS.reduce((sum, method) => sum + Number(amounts[method] || 0), 0);
}

function buildAmountMap() {
  return { ...emptyAmounts };
}

function buildExpectedAmounts(sales: Sale[], expenses: Expense[]) {
  const expected = buildAmountMap();

  sales
    .filter((sale) => !sale.voided)
    .forEach((sale) => {
      expected[sale.payment_method] += Number(sale.amount || 0);
    });

  expenses
    .filter((expense) => expense.status === "paid")
    .forEach((expense) => {
      expected[expense.payment_method] -= Number(expense.amount || 0);
    });

  return expected;
}

function exportClosureCsv(
  date: string,
  expected: AmountByPaymentMethod,
  counted: AmountByPaymentMethod,
  totals: {
    sales: number;
    paidExpenses: number;
    pendingExpenses: number;
    netProfit: number;
    difference: number;
  },
) {
  const rows = [
    ["Cierre de caja", formatDateShort(date)],
    [],
    ["Medio de pago", "Esperado", "Contado", "Diferencia"],
    ...PAYMENT_METHODS.map((method) => [
      PAYMENT_METHOD_LABELS[method],
      expected[method],
      counted[method],
      Number(counted[method] || 0) - Number(expected[method] || 0),
    ]),
    [],
    ["Ventas", totals.sales],
    ["Gastos pagados", totals.paidExpenses],
    ["Gastos pendientes", totals.pendingExpenses],
    ["Ganancia neta", totals.netProfit],
    ["Diferencia de caja", totals.difference],
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cierre-caja-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function CashClosurePage() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [scannerConfig, setScannerConfig] = useState<ScannerConfig>(DEFAULT_SCANNER_CONFIG);
  const [counted, setCounted] = useState<AmountByPaymentMethod>(buildAmountMap);
  const [operatorName, setOperatorName] = useState("");
  const [notes, setNotes] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [
        allSales,
        allExpenses,
        savedClosures,
        savedProducts,
        savedConfig,
        logs,
      ] = await Promise.all([
        window.api.getSales(),
        window.api.getExpenses(),
        window.api.getCashClosures(),
        window.api.getProducts(),
        window.api.getScannerConfig(),
        window.api.getAuditLogs(80),
      ]);

      setSales((allSales || []) as Sale[]);
      setExpenses((allExpenses || []) as Expense[]);
      setClosures((savedClosures || []) as CashClosure[]);
      setProducts((savedProducts || []) as Product[]);
      setScannerConfig({ ...DEFAULT_SCANNER_CONFIG, ...(savedConfig || {}) });
      setAuditLogs((logs || []) as AuditLog[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const daySales = useMemo(
    () => sales.filter((sale) => getDateKey(sale.sale_date) === selectedDate),
    [sales, selectedDate],
  );
  const dayExpenses = useMemo(
    () => expenses.filter((expense) => getDateKey(expense.expense_date) === selectedDate),
    [expenses, selectedDate],
  );
  const activeSales = useMemo(() => daySales.filter((sale) => !sale.voided), [daySales]);
  const paidExpenses = useMemo(
    () => dayExpenses.filter((expense) => expense.status === "paid"),
    [dayExpenses],
  );
  const pendingExpenses = useMemo(
    () => dayExpenses.filter((expense) => expense.status === "pending"),
    [dayExpenses],
  );
  const selectedClosure = useMemo(
    () => closures.find((closure) => closure.close_date === selectedDate) || null,
    [closures, selectedDate],
  );
  const expected = useMemo(
    () => buildExpectedAmounts(daySales, dayExpenses),
    [dayExpenses, daySales],
  );

  useEffect(() => {
    if (selectedClosure) {
      setCounted({ ...emptyAmounts, ...selectedClosure.counted });
      setOperatorName(selectedClosure.operator_name || "");
      setNotes(selectedClosure.notes || "");
      return;
    }

    setCounted(expected);
    setOperatorName("");
    setNotes("");
  }, [expected, selectedClosure]);

  const totals = useMemo(() => {
    const salesTotal = activeSales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
    const paidExpensesTotal = paidExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    );
    const pendingExpensesTotal = pendingExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    );
    const countedTotal = sumAmounts(counted);
    const expectedTotal = sumAmounts(expected);

    return {
      sales: salesTotal,
      paidExpenses: paidExpensesTotal,
      pendingExpenses: pendingExpensesTotal,
      netProfit: salesTotal - paidExpensesTotal,
      counted: countedTotal,
      expected: expectedTotal,
      difference: countedTotal - expectedTotal,
    };
  }, [activeSales, counted, expected, paidExpenses, pendingExpenses]);

  async function saveClosure() {
    setSaving(true);
    setMessage("");

    try {
      const saved = await window.api.saveCashClosure({
        id: selectedClosure?.id,
        close_date: selectedDate,
        counted,
        expected,
        total_sales: totals.sales,
        total_paid_expenses: totals.paidExpenses,
        total_pending_expenses: totals.pendingExpenses,
        net_profit: totals.netProfit,
        difference: totals.difference,
        operator_name: operatorName,
        notes,
        status: "closed",
      });

      setClosures((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current];
      });
      setMessage("Cierre de caja guardado correctamente.");
      setAuditLogs(await window.api.getAuditLogs(80));
    } finally {
      setSaving(false);
    }
  }

  async function saveProduct() {
    if (!productForm.plu.trim() || !productForm.name.trim()) {
      setMessage("Completa PLU y nombre del producto.");
      return;
    }

    const saved = await window.api.saveProduct({
      plu: productForm.plu.replace(/\D/g, "").padStart(6, "0"),
      name: productForm.name.trim(),
      price_per_kg: Number(productForm.price_per_kg || 0),
      active: true,
      notes: productForm.notes.trim(),
    });

    setProducts((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current];
    });
    setProductForm(emptyProductForm);
    setMessage("Producto PLU guardado.");
    setAuditLogs(await window.api.getAuditLogs(80));
  }

  async function deleteProduct(id: string) {
    await window.api.deleteProduct(id);
    setProducts((current) => current.filter((item) => item.id !== id));
    setMessage("Producto eliminado.");
    setAuditLogs(await window.api.getAuditLogs(80));
  }

  async function saveScannerConfig() {
    const saved = await window.api.saveScannerConfig(scannerConfig);
    setScannerConfig(saved);
    setMessage("Configuracion del escaner guardada.");
    setAuditLogs(await window.api.getAuditLogs(80));
  }

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-fade-in">
        <div className="h-16 w-80 rounded-xl bg-slate-100 animate-pulse mb-8" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Cierre de Caja"
        subtitle={`Control diario para ${formatDate(selectedDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
            />
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                exportClosureCsv(selectedDate, expected, counted, {
                  sales: totals.sales,
                  paidExpenses: totals.paidExpenses,
                  pendingExpenses: totals.pendingExpenses,
                  netProfit: totals.netProfit,
                  difference: totals.difference,
                })
              }
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-8">
        {message && (
          <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50 px-4 py-3 text-sm font-medium text-blue-800 shadow-sm animate-slide-up">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
            <Card className="p-5 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Ventas activas</p>
                  <p className="text-xl font-bold text-blue-700 truncate mt-0.5 transition-all duration-300 group-hover:scale-[1.02] origin-left">{formatCurrency(totals.sales)}</p>
                  <p className="text-xs text-slate-400 truncate mt-1">{activeSales.length} operaciones</p>
                </div>
              </div>
            </Card>
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '50ms' }}>
            <Card className="p-5 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Gastos pagados</p>
                  <p className="text-xl font-bold text-red-600 truncate mt-0.5 transition-all duration-300 group-hover:scale-[1.02] origin-left">{formatCurrency(totals.paidExpenses)}</p>
                  <p className="text-xs text-slate-400 truncate mt-1">{paidExpenses.length} gastos</p>
                </div>
              </div>
            </Card>
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            <Card className="p-5 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full opacity-60 group-hover:opacity-100 transition-opacity duration-300 ${totals.netProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md ${totals.netProfit >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                  <Calculator className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Ganancia neta</p>
                  <p className={`text-xl font-bold truncate mt-0.5 transition-all duration-300 group-hover:scale-[1.02] origin-left ${totals.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {formatCurrency(totals.netProfit)}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-1">{formatCurrency(totals.pendingExpenses)} pendiente</p>
                </div>
              </div>
            </Card>
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
            <Card className="p-5 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full opacity-60 group-hover:opacity-100 transition-opacity duration-300 ${totals.difference === 0 ? 'bg-green-500' : totals.difference > 0 ? 'bg-blue-500' : 'bg-red-500'}`} />
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md ${totals.difference === 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' : totals.difference > 0 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Diferencia de caja</p>
                  <p className={`text-xl font-bold truncate mt-0.5 transition-all duration-300 group-hover:scale-[1.02] origin-left ${totals.difference === 0 ? "text-green-700" : totals.difference > 0 ? "text-blue-700" : "text-red-600"}`}>
                    {formatCurrency(totals.difference)}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-1">
                    {selectedClosure ? "Cierre guardado" : "Sin cierre guardado"}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-slate-900">Conteo por medio de pago</h2>
                      <p className="text-xs text-slate-500">Esperado descuenta los gastos pagados del dia.</p>
                    </div>
                  </div>
                  <Badge label={selectedClosure ? "Cerrado" : "Pendiente"} color={selectedClosure ? "green" : "amber"} />
                </div>
              </div>

              <div className="divide-y divide-slate-100 animate-fade-in">
                {PAYMENT_METHODS.map((method, index) => {
                  const diff = Number(counted[method] || 0) - Number(expected[method] || 0);

                  return (
                    <div key={method} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_140px_160px_130px] md:items-center hover:bg-slate-50/60 transition-all duration-200 group" style={{ animationDelay: `${250 + index * 50}ms` }}>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {PAYMENT_METHOD_LABELS[method]}
                        </p>
                        <p className="text-xs text-slate-500">Esperado {formatCurrency(expected[method])}</p>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {formatCurrency(expected[method])}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={formatInputAmount(counted[method])}
                        onChange={(event) =>
                          setCounted((current) => ({
                            ...current,
                            [method]: Number(event.target.value || 0),
                          }))
                        }
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                        placeholder="Contado"
                      />
                      <p className={`text-sm font-bold ${diff === 0 ? "text-green-700" : diff > 0 ? "text-blue-700" : "text-red-600"}`}>
                        {formatCurrency(diff)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-slate-500">Responsable</label>
                    <input
                      value={operatorName}
                      onChange={(event) => setOperatorName(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                      placeholder="Nombre del usuario"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Notas</label>
                    <input
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                      placeholder="Observaciones del cierre"
                    />
                  </div>
                </div>

                <Button className="mt-4 w-full shadow-sm hover:shadow-md transition-all duration-300" loading={saving} onClick={saveClosure}>
                  <Save className="h-4 w-4" />
                  Guardar cierre del dia
                </Button>
              </div>
            </Card>

            <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 animate-slide-up" style={{ animationDelay: '250ms' }}>
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white shadow-sm">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900">Catalogo PLU</h2>
                    <p className="text-xs text-slate-500">El escaner muestra el nombre del producto cuando el PLU existe.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-[110px_1fr_140px]">
                <input
                  value={productForm.plu}
                  onChange={(event) => setProductForm((current) => ({ ...current, plu: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  placeholder="PLU"
                />
                <input
                  value={productForm.name}
                  onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  placeholder="Nombre del producto"
                />
                <input
                  value={productForm.price_per_kg}
                  onChange={(event) => setProductForm((current) => ({ ...current, price_per_kg: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  placeholder="Precio kg"
                />
                <input
                  value={productForm.notes}
                  onChange={(event) => setProductForm((current) => ({ ...current, notes: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200 md:col-span-2"
                  placeholder="Notas"
                />
                <Button onClick={saveProduct} className="shadow-sm hover:shadow-md transition-all duration-300">
                  <Save className="h-4 w-4" />
                  Guardar PLU
                </Button>
              </div>

              <div className="divide-y divide-slate-100 animate-fade-in">
                {products.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-slate-500">Todavia no hay productos PLU cargados.</p>
                ) : (
                  products.slice(0, 10).map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/60 transition-all duration-200 group">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          PLU {product.plu}
                          {product.price_per_kg ? ` - ${formatCurrency(product.price_per_kg)}/kg` : ""}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteProduct(product.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5 hover:shadow-lg transition-all duration-300 animate-slide-up" style={{ animationDelay: '300ms' }}>
              <div className="mb-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white shadow-sm">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Escaner de balanza</h2>
                  <p className="text-xs text-slate-500">Posiciones base 0 del codigo EAN-13.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-500">
                  Prefijo
                  <input
                    value={scannerConfig.barcode_prefix}
                    onChange={(event) => setScannerConfig((current) => ({ ...current, barcode_prefix: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Divisor importe
                  <input
                    type="number"
                    min="1"
                    value={scannerConfig.amount_divisor}
                    onChange={(event) => setScannerConfig((current) => ({ ...current, amount_divisor: Number(event.target.value || 1) }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Inicio PLU
                  <input
                    type="number"
                    min="0"
                    value={scannerConfig.plu_start}
                    onChange={(event) => setScannerConfig((current) => ({ ...current, plu_start: Number(event.target.value || 0) }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Largo PLU
                  <input
                    type="number"
                    min="1"
                    value={scannerConfig.plu_length}
                    onChange={(event) => setScannerConfig((current) => ({ ...current, plu_length: Number(event.target.value || 1) }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Inicio importe
                  <input
                    type="number"
                    min="0"
                    value={scannerConfig.amount_start}
                    onChange={(event) => setScannerConfig((current) => ({ ...current, amount_start: Number(event.target.value || 0) }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Largo importe
                  <input
                    type="number"
                    min="1"
                    value={scannerConfig.amount_length}
                    onChange={(event) => setScannerConfig((current) => ({ ...current, amount_length: Number(event.target.value || 1) }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 focus:shadow-sm transition-all duration-200"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={scannerConfig.detect_truncated_amount !== false}
                  onChange={(event) => setScannerConfig((current) => ({ ...current, detect_truncated_amount: event.target.checked }))}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  <span className="font-medium text-slate-700">Detectar importes truncados</span>
                  <br />
                  Si el precio supera el limite de 6 digitos del codigo de barras (ej: mas de $9.999,99), usa el precio/kg del producto para corregir el importe automaticamente.
                </span>
              </label>

              <Button className="mt-4 w-full shadow-sm hover:shadow-md transition-all duration-300" variant="secondary" onClick={saveScannerConfig}>
                <Save className="h-4 w-4" />
                Guardar configuracion
              </Button>
            </Card>

            <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 animate-slide-up" style={{ animationDelay: '350ms' }}>
              <div className="border-b border-slate-100 p-5 bg-gradient-to-r from-slate-50/80 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900">Actividad reciente</h2>
                    <p className="text-xs text-slate-500">Auditoria local de ventas, gastos y cierres.</p>
                  </div>
                </div>
              </div>

              <div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto animate-fade-in">
                {auditLogs.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">Todavia no hay actividad registrada.</p>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-slate-50/60 transition-all duration-200">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {log.description || `${log.action} ${log.entity}`}
                        </p>
                        <Badge label={log.action} color="slate" />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString("es-AR")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
