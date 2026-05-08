import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  Clock,
  ListTodo,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";

import {
  Expense,
  PaymentMethod,
  ExpenseStatus,
  PAYMENT_METHOD_LABELS,
  EXPENSE_CATEGORIES,
} from "../lib/types";

import { formatCurrency, todayStr, formatDate, formatDateShort } from "../lib/utils";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { PageHeader } from "../components/Layout";
import { Card } from "../components/ui/Card";

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "debit",
  "credit",
  "transfer",
  "digital_wallet",
];

interface ExpenseForm {
  concept: string;
  category: string;
  amount: string;
  payment_method: PaymentMethod;
  status: ExpenseStatus;
  notes: string;
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: "green" | "amber" | "blue" | "slate";
}

const emptyForm: ExpenseForm = {
  concept: "",
  category: "",
  amount: "",
  payment_method: "cash",
  status: "paid",
  notes: "",
};

const toneClasses = {
  green: {
    icon: "bg-green-100 text-green-700",
    value: "text-green-700",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700",
    value: "text-amber-700",
  },
  blue: {
    icon: "bg-blue-100 text-blue-700",
    value: "text-blue-700",
  },
  slate: {
    icon: "bg-slate-100 text-slate-700",
    value: "text-slate-900",
  },
};

const dayInMs = 24 * 60 * 60 * 1000;

function getDateKey(value: string) {
  return value ? value.slice(0, 10) : todayStr();
}

function getDaysPending(date: string, today: string) {
  const start = new Date(`${getDateKey(date)}T00:00:00`).getTime();
  const end = new Date(`${today}T00:00:00`).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 0;

  return Math.max(0, Math.floor((end - start) / dayInMs));
}

function formatAmountInput(value: string) {
  const number = Number(value.replace(/\D/g, ""));
  return number ? number.toLocaleString("es-AR") : "";
}

function getPendingLabel(days: number) {
  if (days === 0) return "Vence hoy";
  if (days === 1) return "1 dia pendiente";
  return `${days} dias pendiente`;
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

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [filterDate, setFilterDate] = useState(todayStr());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [customConcept, setCustomConcept] = useState(false);

  const today = useMemo(() => todayStr(), []);

  const fetchExpenses = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);

    try {
      const data = (await window.api.getExpenses()) as Expense[];
      setExpenses(
        data.sort((a, b) => {
          const dateDiff = getDateKey(b.expense_date).localeCompare(getDateKey(a.expense_date));
          if (dateDiff !== 0) return dateDiff;

          return Number(b.amount) - Number(a.amount);
        })
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
    const intervalId = window.setInterval(() => {
      fetchExpenses(false);
    }, 120000);

    return () => window.clearInterval(intervalId);
  }, [fetchExpenses]);

  function updateForm<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (formError) setFormError("");
  }

  function openCreate() {
    setEditExpense(null);
    setForm(emptyForm);
    setFormError("");
    setCustomConcept(false);
    setModalOpen(true);
  }

  function openEdit(exp: Expense) {
    setEditExpense(exp);
    setForm({
      concept: exp.concept,
      category: exp.category,
      amount: String(exp.amount),
      payment_method: exp.payment_method,
      status: exp.status,
      notes: exp.notes || "",
    });
    setFormError("");
    setCustomConcept(!EXPENSE_CATEGORIES.includes(exp.concept));
    setModalOpen(true);
  }

  async function handleSave() {
    const amount = Number(form.amount.replace(/\D/g, ""));
    const concept = form.concept.trim();
    const category = form.category.trim() || concept;
    const notes = form.notes.trim();

    if (!concept) {
      setFormError("Selecciona o escribe un concepto para el gasto.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Ingresa un monto valido mayor a cero.");
      return;
    }

    setSaving(true);

    try {
      if (editExpense) {
        await window.api.updateExpense({
          id: editExpense.id,
          concept,
          category,
          amount,
          payment_method: form.payment_method,
          status: form.status,
          notes,
        });
      } else {
        await window.api.addExpense({
          date: filterDate,
          concept,
          category,
          amount,
          payment_method: form.payment_method,
          status: form.status,
          notes,
        });
      }

      setModalOpen(false);
      setEditExpense(null);
      setForm(emptyForm);
      await fetchExpenses();
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(exp: Expense) {
    const newStatus: ExpenseStatus = exp.status === "paid" ? "pending" : "paid";

    await window.api.toggleExpenseStatus({
      id: exp.id,
      status: newStatus,
    });

    setExpenses((current) =>
      current.map((item) =>
        item.id === exp.id
          ? {
              ...item,
              status: newStatus,
            }
          : item
      )
    );
  }

  async function handleDelete() {
    if (!deleteId) return;

    await window.api.deleteExpense(deleteId);

    setDeleteId(null);
    setExpenses((current) => current.filter((expense) => expense.id !== deleteId));
  }

  const dayExpenses = useMemo(
    () => expenses.filter((expense) => getDateKey(expense.expense_date) === filterDate),
    [expenses, filterDate]
  );

  const paidDayExpenses = useMemo(
    () => dayExpenses.filter((expense) => expense.status === "paid"),
    [dayExpenses]
  );

  const pendingDayExpenses = useMemo(
    () => dayExpenses.filter((expense) => expense.status === "pending"),
    [dayExpenses]
  );

  const pendingExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.status === "pending")
        .sort((a, b) => {
          const daysDiff = getDaysPending(b.expense_date, today) - getDaysPending(a.expense_date, today);
          if (daysDiff !== 0) return daysDiff;

          return Number(b.amount) - Number(a.amount);
        }),
    [expenses, today]
  );

  const totalPaidToday = paidDayExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const totalPendingToday = pendingDayExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const totalPending = pendingExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const totalDay = dayExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  const recommendedExpense = pendingExpenses[0];
  const urgentPending = pendingExpenses.filter((expense) => getDaysPending(expense.expense_date, today) >= 3);
  const highAmountPending = pendingExpenses.reduce(
    (max, expense) => (Number(expense.amount) > Number(max?.amount || 0) ? expense : max),
    pendingExpenses[0]
  );

  const dayTitle = filterDate === today ? "Gastos de hoy" : "Gastos del dia";

  return (
    <div>
      <PageHeader
        title="Gestion de Gastos"
        subtitle={formatDate(filterDate)}
        actions={
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={() => fetchExpenses()} variant="secondary" size="md" title="Actualizar gastos">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button onClick={openCreate} size="md">
              <Plus className="w-4 h-4" />
              Nuevo Gasto
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            title="Pagado en el dia"
            value={formatCurrency(totalPaidToday)}
            subtitle={`${paidDayExpenses.length} registros pagados`}
            icon={<CheckCircle className="w-5 h-5" />}
            tone="green"
          />
          <StatCard
            title="Pendiente total"
            value={formatCurrency(totalPending)}
            subtitle={`${pendingExpenses.length} gastos por pagar`}
            icon={<Clock className="w-5 h-5" />}
            tone="amber"
          />
          <StatCard
            title="Pendiente del dia"
            value={formatCurrency(totalPendingToday)}
            subtitle={`${pendingDayExpenses.length} quedan en esta fecha`}
            icon={<CalendarClock className="w-5 h-5" />}
            tone="blue"
          />
          <StatCard
            title="Total del dia"
            value={formatCurrency(totalDay)}
            subtitle={`${dayExpenses.length} movimientos cargados`}
            icon={<ReceiptText className="w-5 h-5" />}
            tone="slate"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">{dayTitle}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pagados y pendientes cargados para {formatDateShort(filterDate)}.
                </p>
              </div>
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400 flex-shrink-0" />}
            </div>

            <div className="min-h-[420px] max-h-[64vh] overflow-y-auto scroll-pro">
              {dayExpenses.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-slate-400">
                  <ReceiptText className="w-12 h-12 mb-3 opacity-25" />
                  <p className="text-sm font-medium text-slate-500">Sin gastos para esta fecha</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Usa Nuevo Gasto para registrar pagos o pendientes.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {dayExpenses.map((expense) => {
                    const isPaid = expense.status === "paid";

                    return (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className={`w-2 h-10 rounded-full flex-shrink-0 ${
                              isPaid ? "bg-green-500" : "bg-amber-400"
                            }`}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                {expense.concept}
                              </span>

                              {expense.category && <Badge label={expense.category} color="slate" />}

                              <Badge label={isPaid ? "Pagado" : "Pendiente"} color={isPaid ? "green" : "amber"} />
                            </div>

                            <p className="text-xs text-slate-400 mt-1 truncate">
                              {PAYMENT_METHOD_LABELS[expense.payment_method]}
                              {expense.notes && ` - ${expense.notes}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-base font-bold text-slate-900">
                            {formatCurrency(Number(expense.amount))}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleStatus(expense)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isPaid
                                  ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                  : "text-slate-400 hover:text-green-600 hover:bg-green-50"
                              }`}
                              title={isPaid ? "Volver a pendiente" : "Marcar como pagado"}
                            >
                              {isPaid ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEdit(expense)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar gasto"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteId(expense.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Eliminar gasto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden xl:sticky xl:top-6">
            <div className="bg-amber-50 border-b border-amber-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-5 h-5 text-amber-700" />
                    <h3 className="font-semibold text-slate-900">Pendientes a pagar</h3>
                  </div>
                  <p className="text-xs text-amber-800 mt-1">
                    Siempre visible, aunque cambies la fecha del dia.
                  </p>
                </div>
                <Badge label={`${pendingExpenses.length} activos`} color={pendingExpenses.length ? "amber" : "green"} />
              </div>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-amber-800">Total pendiente</p>
                  <p className="text-2xl font-bold text-amber-900">{formatCurrency(totalPending)}</p>
                </div>
                {urgentPending.length > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-amber-800">Atencion</p>
                    <p className="text-sm font-semibold text-amber-900">
                      {urgentPending.length} con 3+ dias
                    </p>
                  </div>
                )}
              </div>
            </div>

            {recommendedExpense ? (
              <div className="p-5 border-b border-slate-100 bg-white">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                        Recomendado
                      </p>
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        Pagar primero: {recommendedExpense.concept}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {getPendingLabel(getDaysPending(recommendedExpense.expense_date, today))} -{" "}
                        {formatCurrency(Number(recommendedExpense.amount))}
                      </p>
                    </div>
                  </div>
                </div>

                {highAmountPending && highAmountPending.id !== recommendedExpense.id && (
                  <p className="text-xs text-slate-500 mt-3">
                    Monto mas alto pendiente: {highAmountPending.concept} por{" "}
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(Number(highAmountPending.amount))}
                    </span>
                    .
                  </p>
                )}
              </div>
            ) : (
              <div className="p-5 border-b border-slate-100">
                <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-700 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900">Sin pendientes</p>
                    <p className="text-xs text-green-700">Todo lo cargado ya esta pagado.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="max-h-[54vh] overflow-y-auto scroll-pro">
              {pendingExpenses.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400">
                  <Wallet className="w-10 h-10 mx-auto mb-3 opacity-25" />
                  <p className="text-sm">No hay gastos pendientes.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {pendingExpenses.map((expense) => {
                    const days = getDaysPending(expense.expense_date, today);
                    const isRecommended = expense.id === recommendedExpense.id;

                    return (
                      <div key={expense.id} className="p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {expense.concept}
                              </p>
                              {isRecommended && <Badge label="Recomendado" color="blue" />}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {formatDateShort(getDateKey(expense.expense_date))} - {getPendingLabel(days)}
                            </p>
                            {expense.notes && (
                              <p className="text-xs text-slate-400 mt-1 truncate">{expense.notes}</p>
                            )}
                          </div>

                          <p className="text-base font-bold text-amber-800 flex-shrink-0">
                            {formatCurrency(Number(expense.amount))}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <Button
                            size="sm"
                            variant="success"
                            className="flex-1"
                            onClick={() => toggleStatus(expense)}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Marcar pagado
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(expense)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editExpense ? "Editar Gasto" : "Registrar Gasto"}
        size="md"
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Concepto</label>
            {!customConcept ? (
              <div className="flex gap-2">
                <select
                  value={form.concept}
                  onChange={(event) => {
                    const concept = event.target.value;
                    updateForm("concept", concept);
                    updateForm("category", concept);
                  }}
                  className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar concepto...</option>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCustomConcept(true);
                    updateForm("concept", "");
                    updateForm("category", "Otros");
                  }}
                  className="text-xs"
                >
                  Otro
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.concept}
                  onChange={(event) => {
                    updateForm("concept", event.target.value);
                    updateForm("category", "Otros");
                  }}
                  placeholder="Ej: Compra de carne, pan, pollo..."
                  className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCustomConcept(false);
                    updateForm("concept", "");
                    updateForm("category", "");
                  }}
                  className="text-xs"
                >
                  Lista
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>

                <input
                  type="text"
                  inputMode="numeric"
                  value={formatAmountInput(form.amount)}
                  onChange={(event) => updateForm("amount", event.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className="w-full pl-7 pr-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
              <div className="flex gap-2">
                {(["paid", "pending"] as ExpenseStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateForm("status", status)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                      form.status === status
                        ? status === "paid"
                          ? "border-green-600 bg-green-50 text-green-700"
                          : "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {status === "paid" ? "Pagado" : "Pendiente"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Los pendientes quedan visibles hasta marcarlos como pagados.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Medio de Pago</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => updateForm("payment_method", method)}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                    form.payment_method === method
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas (opcional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              placeholder="Observaciones adicionales..."
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>
              {editExpense ? "Guardar Cambios" : "Registrar Gasto"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Confirmar Eliminacion"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">Seguro que queres eliminar este gasto?</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
