import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Ban,
  CheckCircle,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";

import {
  Sale,
  PaymentMethod,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
} from "../lib/types";

import { formatCurrency, todayStr, formatDate } from "../lib/utils";
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

const METHOD_ICONS: Record<PaymentMethod, JSX.Element> = {
  cash: <Banknote className="w-4 h-4" />,
  debit: <CreditCard className="w-4 h-4" />,
  credit: <CreditCard className="w-4 h-4" />,
  transfer: <Landmark className="w-4 h-4" />,
  digital_wallet: <Smartphone className="w-4 h-4" />,
};

interface SaleForm {
  amount: string;
  payment_method: PaymentMethod | "";
  notes: string;
}

interface SaleAlert {
  tone: "warning" | "danger";
  title: string;
  message: string;
}

interface SaleDraft {
  form: SaleForm;
  amountPaid: string;
  baseAmount: string;
  surcharge: number;
  customSurcharge: string;
}

const emptyForm: SaleForm = { amount: "", payment_method: "", notes: "" };

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState<SaleDraft | null>(null);
  const [form, setForm] = useState<SaleForm>(emptyForm);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [surcharge, setSurcharge] = useState(0);
  const [customSurcharge, setCustomSurcharge] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [saleAlert, setSaleAlert] = useState<SaleAlert | null>(null);

  const parseMoney = (value: string | number) => {
    return Number(String(value).replace(/\D/g, ""));
  };

  const formatMoney = (value: string | number) => {
    const number = Number(String(value).replace(/\D/g, ""));
    return number.toLocaleString("es-AR");
  };

  const total = parseMoney(form.amount);
  const paid = parseMoney(amountPaid);
  const change = paid - total;
  const isCredit = form.payment_method === "credit";

  useEffect(() => {
    if (form.payment_method !== "credit") {
      setSurcharge(0);
      setCustomSurcharge("");
      setBaseAmount("");
    }
  }, [form.payment_method]);

  const fetchSales = useCallback(async () => {
    setLoading(true);

    const data = (await window.api.getSales()) as Sale[];
    const filtered = data.filter((s) => s.sale_date === filterDate);

    setSales(filtered);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  function updateForm<K extends keyof SaleForm>(key: K, value: SaleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (saleAlert) setSaleAlert(null);
  }

  function resetCreateForm() {
    setEditSale(null);
    setDraftBeforeEdit(null);
    setForm(emptyForm);
    setSaleAlert(null);
    setAmountPaid("");
    setBaseAmount("");
    setSurcharge(0);
    setCustomSurcharge("");
  }

  function restoreCreateDraft() {
    if (!draftBeforeEdit) {
      resetCreateForm();
      return;
    }

    setForm(draftBeforeEdit.form);
    setAmountPaid(draftBeforeEdit.amountPaid);
    setBaseAmount(draftBeforeEdit.baseAmount);
    setSurcharge(draftBeforeEdit.surcharge);
    setCustomSurcharge(draftBeforeEdit.customSurcharge);
    setDraftBeforeEdit(null);
    setEditSale(null);
    setSaleAlert(null);
  }

  function closeEditModal() {
    setModalOpen(false);
    restoreCreateDraft();
  }

  function openEdit(sale: Sale) {
    const rawAmount = String(sale.amount);

    setDraftBeforeEdit({
      form,
      amountPaid,
      baseAmount,
      surcharge,
      customSurcharge,
    });
    setEditSale(sale);
    setForm({
      amount: rawAmount,
      payment_method: sale.payment_method,
      notes: sale.notes || "",
    });
    setBaseAmount(rawAmount);
    setAmountPaid("");
    setSurcharge(0);
    setCustomSurcharge("");
    setSaleAlert(null);
    setModalOpen(true);
  }

  async function handleSave() {
    const amount = Number(form.amount);
    const paymentMethod = form.payment_method;

    if (!form.amount || amount <= 0) {
      setSaleAlert({
        tone: "danger",
        title: "Monto invalido",
        message: "Ingresa un monto mayor a cero para registrar la venta.",
      });
      return;
    }

    if (!paymentMethod) {
      setSaleAlert({
        tone: "warning",
        title: "Falta el medio de pago",
        message: "Selecciona si el cliente pago en efectivo, debito, credito, transferencia o billetera digital.",
      });
      return;
    }

    setSaving(true);

    try {
      if (editSale) {
        await window.api.updateSale({
          id: editSale.id,
          amount,
          payment_method: paymentMethod,
          notes: form.notes.trim(),
        });
        setModalOpen(false);
        restoreCreateDraft();
      } else {
        await window.api.addSale({
          date: filterDate,
          amount,
          method: paymentMethod,
          notes: form.notes.trim(),
        });
        resetCreateForm();
      }

      setSaleAlert(null);
      fetchSales();
    } catch (error) {
      console.error("Error guardando venta:", error);
      setSaleAlert({
        tone: "danger",
        title: "No se pudo guardar",
        message: "La venta no se registro. Revisa los datos e intenta nuevamente.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleVoid(sale: Sale) {
    await window.api.toggleSaleVoid({
      id: sale.id,
      voided: !sale.voided,
    });
    fetchSales();
  }

  async function handleDelete() {
    if (!deleteId) return;

    await window.api.deleteSale(deleteId);
    setDeleteId(null);
    fetchSales();
  }

  const activeSales = sales.filter((s) => !s.voided);
  const voidedSales = sales.filter((s) => s.voided);

  const totalByMethod = PAYMENT_METHODS.reduce(
    (acc, m) => {
      acc[m] = activeSales
        .filter((s) => s.payment_method === m)
        .reduce((sum, sale) => sum + Number(sale.amount), 0);

      return acc;
    },
    {} as Record<PaymentMethod, number>,
  );

  const grandTotal = activeSales.reduce((s, sale) => s + sale.amount, 0);

  function applySurcharge(percent: number) {
    const base = Number(baseAmount) || 0;
    const newTotal = base + (base * percent) / 100;

    setSurcharge(percent);
    setCustomSurcharge("");
    updateForm("amount", String(Math.round(newTotal)));
  }

  function renderSaleForm() {
    return (
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        {saleAlert && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              saleAlert.tone === "danger"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  saleAlert.tone === "danger"
                    ? "bg-red-600 text-white"
                    : "bg-amber-500 text-white"
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{saleAlert.title}</p>
                <p className="text-xs mt-1 opacity-80">{saleAlert.message}</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Medio de Pago
          </label>
          {!form.payment_method && (
            <p className="text-xs text-slate-500 mb-2">
              Selecciona el metodo antes de registrar la venta.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateForm("payment_method", m)}
                className={`
                  flex min-w-0 items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all
                  ${
                    form.payment_method === m
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }
                `}
              >
                {METHOD_ICONS[m]}
                <span className="truncate">{PAYMENT_METHOD_LABELS[m]}</span>
              </button>
            ))}
          </div>
        </div>

        {isCredit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Recargo por credito
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setSurcharge(0);
                  setCustomSurcharge("");
                  updateForm("amount", baseAmount);
                }}
                className={`px-3 py-1 rounded-lg border text-sm ${
                  surcharge === 0
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white border-slate-300"
                }`}
              >
                0%
              </button>

              {[5, 10].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applySurcharge(p)}
                  className={`px-3 py-1 rounded-lg border text-sm ${
                    surcharge === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white border-slate-300"
                  }`}
                >
                  {p}%
                </button>
              ))}

              <input
                type="number"
                placeholder="%"
                className="w-20 px-2 py-1 border rounded-lg text-sm"
                value={customSurcharge}
                onChange={(e) => {
                  const val = e.target.value;
                  const percent = Number(val) || 0;
                  const base = Number(baseAmount) || 0;
                  const newTotal = base + (base * percent) / 100;

                  setCustomSurcharge(val);
                  setSurcharge(percent);
                  updateForm("amount", String(Math.round(newTotal)));
                }}
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Monto
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={formatMoney(form.amount)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");

                updateForm("amount", raw);
                setBaseAmount(raw);
              }}
              placeholder="0"
              className="w-full pl-7 pr-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Pago del cliente
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={formatMoney(amountPaid)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setAmountPaid(raw);
              }}
              placeholder="0"
              className="w-full pl-7 pr-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium"
            />
          </div>
        </div>

        {amountPaid && (
          <div className="rounded-xl border border-slate-300 px-4 py-3 bg-white shadow-sm flex justify-between items-center">
            {paid < total ? (
              <>
                <span className="text-sm text-slate-500">Faltante</span>
                <span className="text-red-500 font-semibold text-lg">
                  -${(total - paid).toLocaleString("es-AR")}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm text-slate-500">Vuelto</span>
                <span className="text-green-600 font-semibold text-lg">
                  ${change.toLocaleString("es-AR")}
                </span>
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Notas (opcional)
          </label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => updateForm("notes", e.target.value)}
            placeholder="Ej: Mesa 5, pedido especial..."
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={editSale ? closeEditModal : resetCreateForm}
          >
            {editSale ? "Cancelar" : "Limpiar"}
          </Button>
          <Button type="submit" className="flex-1" loading={saving}>
            {editSale ? "Guardar Cambios" : "Registrar Venta"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <PageHeader
        title="Registro de Ventas"
        subtitle={formatDate(filterDate)}
        actions={
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {PAYMENT_METHODS.map((m) => (
            <Card key={m} className="p-4">
              <p className="text-xs text-slate-500 mb-1">
                {PAYMENT_METHOD_LABELS[m]}
              </p>
              <p
                className="text-lg font-bold"
                style={{ color: PAYMENT_METHOD_COLORS[m] }}
              >
                {formatCurrency(totalByMethod[m])}
              </p>
            </Card>
          ))}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-600 mb-1 font-medium">TOTAL</p>
            <p className="text-lg font-bold text-blue-700">
              {formatCurrency(grandTotal)}
            </p>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="flex flex-col h-[68vh] min-h-[560px]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
              <h3 className="font-semibold text-slate-900">
                Ventas del dia
                {loading && (
                  <RefreshCw className="inline w-4 h-4 ml-2 animate-spin text-slate-400" />
                )}
              </h3>
              <span className="text-sm text-slate-500 whitespace-nowrap">
                {activeSales.length} activas · {voidedSales.length} anuladas
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sales.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Plus className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">Sin ventas para esta fecha</p>
                  <p className="text-xs mt-1">
                    Registra la primera venta desde el panel lateral
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className={`flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors ${
                        sale.voided ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className="w-2 h-8 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: sale.voided
                              ? "#cbd5e1"
                              : PAYMENT_METHOD_COLORS[sale.payment_method],
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 truncate">
                              {PAYMENT_METHOD_LABELS[sale.payment_method]}
                            </span>
                            {sale.voided && <Badge label="Anulada" color="red" />}
                          </div>
                          {sale.notes && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {sale.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`text-base font-bold ${
                            sale.voided
                              ? "text-slate-400 line-through"
                              : "text-slate-900"
                          }`}
                        >
                          {formatCurrency(sale.amount)}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(sale)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => toggleVoid(sale)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              sale.voided
                                ? "text-slate-400 hover:text-green-600 hover:bg-green-50"
                                : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                            }`}
                            title={sale.voided ? "Reactivar" : "Anular"}
                          >
                            {sale.voided ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            onClick={() => setDeleteId(sale.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="h-fit xl:sticky xl:top-6">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Plus className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Registrar Nueva Venta
                  </h3>
                  <p className="text-xs text-slate-500">
                    Carga rapida para {formatDate(filterDate)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">{renderSaleForm()}</div>
          </Card>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeEditModal}
        title="Editar Venta"
        size="sm"
      >
        {renderSaleForm()}
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Confirmar Eliminacion"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">
            Estas seguro de que queres eliminar esta venta? Esta accion no se
            puede deshacer.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setDeleteId(null)}
            >
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
