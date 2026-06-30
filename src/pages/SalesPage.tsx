import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Ban,
  Barcode,
  CheckCircle,
  CreditCard,
  Filter,
  History,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

import {
  Sale,
  PaymentMethod,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  Product,
  ScannerConfig,
} from "../lib/types";

import { formatCurrency, todayStr, formatDate } from "../lib/utils";
import {
  DEFAULT_SCANNER_CONFIG,
  getScaleBarcodeError,
  parseScaleBarcode,
} from "../lib/scaleBarcode";
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

type SalePaymentFilter = "all" | "card" | PaymentMethod;

const SALE_FILTER_OPTIONS: Array<{ value: SalePaymentFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "debit", label: "Debito" },
  { value: "credit", label: "Credito" },
  { value: "transfer", label: "Transferencia" },
  { value: "digital_wallet", label: "Billetera" },
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

interface ScannedTicket {
  id: string;
  code: string;
  amount: number;
  label: string;
  truncatedAmount?: boolean;
  rawAmount?: number;
  estimatedWeightKg?: number;
}

interface ScannerMessage {
  tone: "success" | "warning" | "danger";
  message: string;
}

interface SaleDraft {
  form: SaleForm;
  amountPaid: string;
  baseAmount: string;
  surcharge: number;
  customSurcharge: string;
  discount: number;
  customDiscount: string;
  scannedTickets: ScannedTicket[];
}

const emptyForm: SaleForm = { amount: "", payment_method: "", notes: "" };
const SCANNER_IDLE_MS = 250;

function playBeep(freq = 880, duration = 120) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {
  }
}

function playError() {
  playBeep(220, 300);
}

function playSuccess() {
  playBeep(660, 60);
  setTimeout(() => playBeep(880, 120), 80);
}

function playWarning() {
  playBeep(440, 140);
  setTimeout(() => playBeep(440, 140), 180);
}

function parseMoney(value: string | number) {
  return Number(String(value).replace(/\D/g, ""));
}

function formatMoney(value: string | number) {
  const number = Number(String(value).replace(/\D/g, ""));
  return number ? number.toLocaleString("es-AR") : "";
}

function getSaleSortTime(sale: Sale) {
  const time = new Date(sale.created_at || sale.updated_at || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function matchesSalePaymentFilter(sale: Sale, filter: SalePaymentFilter) {
  if (filter === "all") return true;
  if (filter === "card") {
    return sale.payment_method === "debit" || sale.payment_method === "credit";
  }

  return sale.payment_method === filter;
}

// ====== sessionStorage persistence helpers ======
function getSalesDraft(): SaleDraft | null {
  try {
    const stored = sessionStorage.getItem("sales_draft");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveSalesDraft(draft: SaleDraft) {
  try {
    sessionStorage.setItem("sales_draft", JSON.stringify(draft));
  } catch {
    // Ignore storage errors
  }
}

function clearSalesDraft() {
  try {
    sessionStorage.removeItem("sales_draft");
  } catch {
    // Ignore storage errors
  }
}

function getScannerModeState(): boolean {
  try {
    const stored = sessionStorage.getItem("scanner_mode_active");
    return stored === "true";
  } catch {
    return false;
  }
}

function saveScannerModeState(active: boolean) {
  try {
    sessionStorage.setItem("scanner_mode_active", String(active));
  } catch {
    // Ignore storage errors
  }
}

function clearScannerModeState() {
  try {
    sessionStorage.removeItem("scanner_mode_active");
  } catch {
    // Ignore storage errors
  }
}

export function SalesPage() {
  // Restore draft from sessionStorage or use empty
  const savedDraft = getSalesDraft();
  
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState<SaleDraft | null>(null);
  const [form, setForm] = useState<SaleForm>(savedDraft?.form || emptyForm);
  const [filterDate, setFilterDate] = useState(todayStr());
  const [salePaymentFilter, setSalePaymentFilter] = useState<SalePaymentFilter>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState(savedDraft?.amountPaid || "");
  const [surcharge, setSurcharge] = useState(savedDraft?.surcharge || 0);
  const [customSurcharge, setCustomSurcharge] = useState(savedDraft?.customSurcharge || "");
  const [discount, setDiscount] = useState(savedDraft?.discount || 0);
  const [customDiscount, setCustomDiscount] = useState(savedDraft?.customDiscount || "");
  const [baseAmount, setBaseAmount] = useState(savedDraft?.baseAmount || "");
  const [saleAlert, setSaleAlert] = useState<SaleAlert | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scannedTickets, setScannedTickets] = useState<ScannedTicket[]>(savedDraft?.scannedTickets || []);
  const [scannerMessage, setScannerMessage] = useState<ScannerMessage | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [scannerConfig, setScannerConfig] = useState<ScannerConfig>(DEFAULT_SCANNER_CONFIG);
  const [scannerMode, setScannerMode] = useState(getScannerModeState());
  const [scannerBackend, setScannerBackend] = useState("");
  const [scannerHistory, setScannerHistory] = useState<ScannerHistoryEntry[]>([]);
  const [showScannerHistory, setShowScannerHistory] = useState(false);

  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef("");
  const lastScannerKeyAtRef = useRef(0);
  const scannerBlockedRef = useRef(false);
  const barcodeSubmitRef = useRef<(value: string) => void>(() => undefined);
  const quickSaveRef = useRef<() => void>(() => undefined);
  const scannerConfigRef = useRef<ScannerConfig>(DEFAULT_SCANNER_CONFIG);
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const focusScannerInput = useCallback(() => {
    window.setTimeout(() => {
      if (scannerBlockedRef.current) return;

      const input = scannerInputRef.current;
      if (!input) return;

      input.focus({ preventScroll: true });
      input.select();
    }, 0);
  }, []);

  const total = parseMoney(form.amount);
  const paid = parseMoney(amountPaid);
  const change = paid - total;
  const isCredit = form.payment_method === "credit";
  const isCash = form.payment_method === "cash";
  const scannerTotal = scannedTickets.reduce((sum, ticket) => sum + ticket.amount, 0);

  scannerBlockedRef.current = modalOpen || Boolean(deleteId);

  useEffect(() => {
    if (form.payment_method !== "credit") {
      setSurcharge(0);
      setCustomSurcharge("");
      setBaseAmount("");
    }
  }, [form.payment_method]);

  // FIX #2, #4: Auto-save draft to sessionStorage every time form changes (debounced)
  useEffect(() => {
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      if (!editSale) { // Only save when creating new, not editing
        const draft: SaleDraft = {
          form,
          amountPaid,
          baseAmount,
          surcharge,
          customSurcharge,
          discount,
          customDiscount,
          scannedTickets,
        };
        saveSalesDraft(draft);
      }
    }, 500); // Save after 500ms of inactivity

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, [form, amountPaid, baseAmount, surcharge, customSurcharge, discount, customDiscount, scannedTickets, editSale]);

  const fetchSales = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);

    const data = (await window.api.getSales()) as Sale[];
    const filtered = data
      .map((sale, index) => ({ sale, index }))
      .filter(({ sale }) => sale.sale_date === filterDate)
      .sort((a, b) => {
        const timeDiff = getSaleSortTime(b.sale) - getSaleSortTime(a.sale);
        return timeDiff || b.index - a.index;
      })
      .map(({ sale }) => sale);

    setSales(filtered);
    if (showLoading) setLoading(false);
  }, [filterDate]);

  useEffect(() => {
    fetchSales();

    // Poll for sales updates every 2 seconds so changes reflect in real-time
    const pollInterval = setInterval(() => {
      fetchSales(false);
    }, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchSales]);

  useEffect(() => {
    let cancelled = false;

    async function fetchScannerData() {
      const [savedProducts, savedConfig, history, backend] = await Promise.all([
        window.api.getProducts(),
        window.api.getScannerConfig(),
        window.api.getScannerHistory(),
        window.api.getScannerBackend(),
      ]);

      if (cancelled) return;

      setProducts((savedProducts || []) as Product[]);
      const merged = { ...DEFAULT_SCANNER_CONFIG, ...(savedConfig || {}) };
      setScannerConfig(merged);
      scannerConfigRef.current = merged;
      setScannerHistory(history || []);
      setScannerBackend(backend);
    }

    fetchScannerData();

    const interval = setInterval(async () => {
      const history = await window.api.getScannerHistory();
      if (!cancelled) setScannerHistory(history || []);
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    focusScannerInput();

    function handleWindowFocus() {
      focusScannerInput();
    }

    function handleVisibilityChange() {
      if (!document.hidden) focusScannerInput();
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [focusScannerInput]);

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (scannerBlockedRef.current) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target === scannerInputRef.current) return;

      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isEditable) return;

      const now = Date.now();
      if (now - lastScannerKeyAtRef.current > SCANNER_IDLE_MS) {
        scannerBufferRef.current = "";
      }

      lastScannerKeyAtRef.current = now;

      if (event.key === "Enter") {
        const buffered = scannerBufferRef.current;
        scannerBufferRef.current = "";

        if (buffered.length >= 8) {
          event.preventDefault();
          barcodeSubmitRef.current(buffered);
          return;
        }

        if (!isEditable) {
          event.preventDefault();
          quickSaveRef.current();
        }
        return;
      }

      if (/^\d$/.test(event.key)) {
        scannerBufferRef.current = `${scannerBufferRef.current}${event.key}`.slice(-32);
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, []);

  useEffect(() => {
    // FIX #1: Persist scanner mode to sessionStorage (don't disable on unmount)
    window.api.toggleScannerMode(scannerMode);
    saveScannerModeState(scannerMode);
    
    // Don't cleanup - scanner should stay active when navigating away
    // Only disable scanner explicitly when form is reset or saved
  }, [scannerMode]);

  useEffect(() => {
    const unsub = window.api.onBarcode((barcode) => {
      const config = scannerConfigRef.current;
      if (config.play_sound) playSuccess();
      barcodeSubmitRef.current(barcode);
      if (config.auto_open_sale && !modalOpen && !editSale) {
        setModalOpen(true);
      }
    });
    return unsub;
  }, [modalOpen, editSale]);

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
    setDiscount(0);
    setCustomDiscount("");
    setBarcodeInput("");
    setScannedTickets([]);
    setScannerMessage(null);
    setScannerMode(false); // FIX #1: Disable scanner after saving
    clearSalesDraft();
    clearScannerModeState();
    focusScannerInput();
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
    setDiscount(draftBeforeEdit.discount);
    setCustomDiscount(draftBeforeEdit.customDiscount);
    setScannedTickets(draftBeforeEdit.scannedTickets);
    setDraftBeforeEdit(null);
    setEditSale(null);
    setSaleAlert(null);
    focusScannerInput();
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
      discount,
      customDiscount,
      scannedTickets,
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
    setBarcodeInput("");
    setScannedTickets([]);
    setScannerMessage(null);
    setSaleAlert(null);
    setModalOpen(true);
  }

  function applyAmountFromScanner(nextAmount: number) {
    const amount = nextAmount > 0 ? String(nextAmount) : "";
    updateForm("amount", amount);
    setBaseAmount(amount);
  }

  function handleBarcodeSubmit(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;

    if (editSale) {
      setScannerMessage({
        tone: "warning",
        message: "Cierra la edicion antes de escanear tickets para una venta nueva.",
      });
      setBarcodeInput("");
      if (scannerConfigRef.current.play_sound) playError();
      return;
    }

    const parsed = parseScaleBarcode(value, scannerConfig, products);

    if (!parsed) {
      setScannerMessage({
        tone: "danger",
        message: getScaleBarcodeError(value, scannerConfig),
      });
      setBarcodeInput("");
      if (scannerConfigRef.current.play_sound) playError();
      focusScannerInput();
      return;
    }

    const nextTickets = [
      ...scannedTickets,
      {
        id: `${Date.now()}-${parsed.code}`,
        code: parsed.code,
        amount: parsed.amount,
        label: parsed.label,
        truncatedAmount: parsed.truncatedAmount,
        rawAmount: parsed.rawAmount,
        estimatedWeightKg: parsed.estimatedWeightKg,
      },
    ];
    const nextAmount = parseMoney(form.amount) + parsed.amount;

    setScannedTickets(nextTickets);
    applyAmountFromScanner(nextAmount);

    const defaultPayment = scannerConfigRef.current.default_payment_method;
    if (defaultPayment && PAYMENT_METHODS.includes(defaultPayment) && !form.payment_method) {
      updateForm("payment_method", defaultPayment);
    }

    if (parsed.truncatedAmount) {
      setScannerMessage({
        tone: "warning",
        message: `Importe corregido: la balanza informo ${formatCurrency(parsed.rawAmount)} pero el precio real estimado es ${formatCurrency(parsed.amount)} (~${parsed.estimatedWeightKg?.toFixed(2)}kg). Verifica el ticket antes de cobrar.`,
      });
      if (scannerConfigRef.current.play_sound) playWarning();
    } else {
      setScannerMessage({
        tone: "success",
        message: `Ticket detectado: ${formatCurrency(parsed.amount)}`,
      });
    }
    setBarcodeInput("");
    focusScannerInput();
  }

  barcodeSubmitRef.current = handleBarcodeSubmit;

  function removeScannedTicket(ticketId: string) {
    const ticket = scannedTickets.find((item) => item.id === ticketId);
    if (!ticket) return;

    const nextTickets = scannedTickets.filter((item) => item.id !== ticketId);
    const nextAmount = Math.max(0, parseMoney(form.amount) - ticket.amount);

    setScannedTickets(nextTickets);
    applyAmountFromScanner(nextAmount);
    setScannerMessage(
      nextTickets.length
        ? {
            tone: "warning",
            message: `Ticket quitado. Total escaneado: ${formatCurrency(
              nextTickets.reduce((sum, item) => sum + item.amount, 0),
            )}.`,
          }
        : null,
    );
    focusScannerInput();
  }

  function clearScannedTickets() {
    if (scannedTickets.length === 0) {
      setBarcodeInput("");
      setScannerMessage(null);
      focusScannerInput();
      return;
    }

    const nextAmount = Math.max(0, parseMoney(form.amount) - scannerTotal);

    setScannedTickets([]);
    applyAmountFromScanner(nextAmount);
    setBarcodeInput("");
    setScannerMessage(null);
    focusScannerInput();
  }

  async function handleSave() {
    const amount = Number(form.amount);
    const paymentMethod = form.payment_method;
    const scannerNote =
      scannedTickets.length > 0
        ? `Tickets balanza: ${scannedTickets
            .map((ticket) => `${ticket.code} ${formatCurrency(ticket.amount)}`)
            .join(", ")}`
        : "";
    const notes = [form.notes.trim(), scannerNote].filter(Boolean).join(" | ");

    if (!form.amount || amount <= 0) {
      setSaleAlert({
        tone: "danger",
        title: "Monto invalido",
        message: "Ingresa un monto mayor a cero para registrar la venta.",
      });
      return;
    }

    if (String(amount).length > 10) {
      setSaleAlert({
        tone: "danger",
        title: "Monto fuera de rango",
        message: `El monto $${amount.toLocaleString("es-AR")} parece ser un error del escaner (codigo de barras sin parsear). Revisa el importe antes de guardar.`,
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
          notes,
        });
        setModalOpen(false);
        restoreCreateDraft();
      } else {
        await window.api.addSale({
          date: filterDate,
          amount,
          method: paymentMethod,
          notes,
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

  quickSaveRef.current = () => {
    if (saving || editSale || modalOpen || deleteId) return;
    if (!form.amount || Number(form.amount) <= 0 || !form.payment_method) return;

    handleSave();
  };

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
  const visibleSales = sales.filter((sale) =>
    matchesSalePaymentFilter(sale, salePaymentFilter),
  );
  const visibleActiveSales = visibleSales.filter((sale) => !sale.voided);
  const visibleVoidedSales = visibleSales.filter((sale) => sale.voided);
  const visibleTotal = visibleActiveSales.reduce(
    (sum, sale) => sum + Number(sale.amount),
    0,
  );

  const totalByMethod = PAYMENT_METHODS.reduce(
    (acc, m) => {
      acc[m] = activeSales
        .filter((s) => s.payment_method === m)
        .reduce((sum, sale) => sum + Number(sale.amount), 0);
      return acc;
    },
    {} as Record<PaymentMethod, number>,
  );
  const countByMethod = PAYMENT_METHODS.reduce(
    (acc, m) => {
      acc[m] = activeSales.filter((s) => s.payment_method === m).length;
      return acc;
    },
    {} as Record<PaymentMethod, number>,
  );

  const grandTotal = activeSales.reduce((s, sale) => s + sale.amount, 0);

  function applySurcharge(percent: number) {
    const base = Number(baseAmount) || Number(form.amount) || 0;
    if (!base) return;
    const newTotal = base + (base * percent) / 100;

    if (!baseAmount) setBaseAmount(String(base));
    setSurcharge(percent);
    setCustomSurcharge("");
    updateForm("amount", String(Math.round(newTotal)));
  }

  function applyDiscount(percent: number) {
    const base = Number(baseAmount) || Number(form.amount) || 0;
    if (!base) return;
    const newTotal = base - (base * percent) / 100;

    if (!baseAmount) setBaseAmount(String(base));
    setDiscount(percent);
    setCustomDiscount("");
    updateForm("amount", String(Math.max(Math.round(newTotal), 0)));
  }

  function renderScannerPanel() {
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Barcode className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <p className="text-xs font-medium text-slate-700">Escaner</p>
            {scannerBackend && scannerMode && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 font-mono">{scannerBackend}</span>
            )}
            {scannerMode && <span className="text-[10px] text-green-600 font-medium">activo</span>}
          </div>
          {scannedTickets.length > 0 && (
            <button type="button" onClick={clearScannedTickets} className="p-1 rounded text-blue-600 hover:bg-blue-100 transition-colors" title="Limpiar">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        <input
          ref={scannerInputRef}
          type="text"
          inputMode="numeric"
          value={barcodeInput}
          onChange={(event) => setBarcodeInput(event.target.value.replace(/\D/g, ""))}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (event.currentTarget.value.trim()) { handleBarcodeSubmit(event.currentTarget.value); return; }
            quickSaveRef.current();
          }}
          placeholder="Codigo de barras o Enter para guardar"
          className="w-full rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
        />

        {scannerMessage && (
          <div className={`rounded px-2 py-1 text-[11px] flex items-center gap-1.5 ${
            scannerMessage.tone === "success" ? "bg-green-50 text-green-700" : scannerMessage.tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"
          }`}>
            <span>{scannerMessage.tone === "success" ? "✓" : "✗"}</span>
            <span>{scannerMessage.message}</span>
          </div>
        )}

        {scannedTickets.length > 0 && (
          <div className="rounded-lg border border-blue-100 bg-white max-h-24 overflow-y-auto">
            <div className="px-2.5 py-1.5 border-b border-blue-50 flex items-center justify-between gap-2 sticky top-0 bg-white">
              <span className="text-[11px] font-medium text-slate-500">{scannedTickets.length} ticket{scannedTickets.length === 1 ? "" : "s"}</span>
              <span className="text-xs font-bold text-blue-700">{formatCurrency(scannerTotal)}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {scannedTickets.map((ticket, index) => (
                <div key={ticket.id} className={`px-2.5 py-1.5 flex items-center justify-between gap-2 ${ticket.truncatedAmount ? "bg-amber-50" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-700 truncate flex items-center gap-1">
                      {ticket.truncatedAmount && (
                        <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      )}
                      Ticket {index + 1} - {ticket.label}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {ticket.code}
                      {ticket.truncatedAmount && ticket.rawAmount !== undefined && (
                        <span className="text-amber-600"> · corregido (balanza: {formatCurrency(ticket.rawAmount)})</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[11px] font-bold ${ticket.truncatedAmount ? "text-amber-700" : "text-slate-900"}`} title={ticket.truncatedAmount ? `Importe corregido por limite de 6 digitos del codigo de barras. Peso estimado: ~${ticket.estimatedWeightKg?.toFixed(2)}kg` : undefined}>
                      {formatCurrency(ticket.amount)}
                    </span>
                    <button type="button" onClick={() => removeScannedTicket(ticket.id)} className="p-0.5 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Quitar">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSaleForm() {
    return (
          <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        {saleAlert && (
          <div
            className={`rounded-lg border px-3 py-2.5 ${
              saleAlert.tone === "danger"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold">{saleAlert.title}</p>
                <p className="text-[11px] mt-0.5 opacity-80">{saleAlert.message}</p>
              </div>
            </div>
          </div>
        )}

        {!editSale && renderScannerPanel()}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Medio de Pago
          </label>
          <div className="grid grid-cols-5 gap-2.5">
            {PAYMENT_METHODS.map((m) => {
              const active = form.payment_method === m;
              const color = PAYMENT_METHOD_COLORS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    updateForm("payment_method", m);
                    setSurcharge(0);
                    setCustomSurcharge("");
                    setDiscount(0);
                    setCustomDiscount("");
                    if (baseAmount) updateForm("amount", baseAmount);
                  }}
                  className={`group relative rounded-2xl border-2 transition-all ${active ? "shadow-lg scale-105" : "hover:scale-[1.03] hover:shadow-md"}`}
                  style={{
                    borderColor: active ? color : "#e2e8f0",
                    background: active ? `linear-gradient(145deg, ${color} 0%, ${color}dd 100%)` : "#fff",
                    padding: "14px 0",
                  }}
                >
                  <div style={{ color: active ? "#fff" : color }} className="flex justify-center">
                    <div className={active ? "" : "drop-shadow-sm"}>
                      {METHOD_ICONS[m]}
                    </div>
                  </div>
                  <div
                    className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold opacity-0 shadow-lg transition-all group-hover:opacity-100 group-hover:-translate-y-0.5"
                    style={{ backgroundColor: color, color: "#fff" }}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45" style={{ backgroundColor: color }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {isCredit && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Recargo
            </label>
            <div className="flex gap-1.5">
              {[0, 5, 10].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (p === 0) { setSurcharge(0); setCustomSurcharge(""); const fb = baseAmount || form.amount; updateForm("amount", fb); if (!baseAmount) setBaseAmount(fb); }
                    else { setDiscount(0); setCustomDiscount(""); applySurcharge(p); }
                  }}
                  className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                    surcharge === p ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"
                  }`}
                >
                  +{p}%
                </button>
              ))}
              <input
                type="number"
                placeholder="%"
                className="w-16 px-2 py-1 border rounded-md text-xs"
                value={customSurcharge}
                onChange={(e) => {
                  const val = e.target.value;
                  const percent = Number(val) || 0;
                  const base = Number(baseAmount) || Number(form.amount) || 0;
                  if (!base) return;
                  if (!baseAmount) setBaseAmount(String(base));
                  setCustomSurcharge(val);
                  setSurcharge(percent);
                  setDiscount(0);
                  setCustomDiscount("");
                  updateForm("amount", String(Math.round(base + (base * percent) / 100)));
                }}
              />
            </div>
          </div>
        )}

        {isCash && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Descuento
            </label>
            <div className="flex gap-1.5">
              {[0, 5, 10].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (p === 0) { setDiscount(0); setCustomDiscount(""); updateForm("amount", baseAmount); }
                    else { setSurcharge(0); setCustomSurcharge(""); applyDiscount(p); }
                  }}
                  className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                    discount === p ? "bg-green-600 text-white border-green-600" : "bg-white border-slate-300"
                  }`}
                >
                  -{p}%
                </button>
              ))}
              <input
                type="number"
                placeholder="%"
                className="w-16 px-2 py-1 border rounded-md text-xs"
                value={customDiscount}
                onChange={(e) => {
                  const val = e.target.value;
                  const percent = Number(val) || 0;
                  const base = Number(baseAmount) || Number(form.amount) || 0;
                  if (!base) return;
                  if (!baseAmount) setBaseAmount(String(base));
                  setCustomDiscount(val);
                  setDiscount(percent);
                  setSurcharge(0);
                  setCustomSurcharge("");
                  updateForm("amount", String(Math.max(Math.round(base - (base * percent) / 100), 0)));
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Monto</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
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
                className="w-full pl-6 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Paga con</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatMoney(amountPaid)}
                onChange={(e) => setAmountPaid(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="w-full pl-6 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>
        </div>

        {amountPaid && (
          <div className={`rounded-lg border px-3 py-2 flex justify-between items-center text-sm ${
            paid < total ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
          }`}>
            <span className="text-xs font-medium">{paid < total ? "Faltante" : "Vuelto"}</span>
            <span className="font-bold">
              {paid < total ? "-" : "+"}${(paid < total ? total - paid : change).toLocaleString("es-AR")}
            </span>
          </div>
        )}

        <input
          type="text"
          value={form.notes}
          onChange={(e) => updateForm("notes", e.target.value)}
          placeholder="Notas (opcional)"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className={editSale ? "flex gap-2 pt-1" : "sticky bottom-0 z-20 -mx-7 -mb-7 flex gap-2 border-t border-slate-100 bg-white/95 px-7 py-4 backdrop-blur"}>
          <Button type="button" variant="secondary" className="flex-1 text-sm py-2" onClick={editSale ? closeEditModal : resetCreateForm}>
            {editSale ? "Cancelar" : "Limpiar"}
          </Button>
          <Button type="submit" className="flex-1 text-sm py-2" loading={saving}>
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setScannerMode(!scannerMode)}
                className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  scannerMode
                    ? "bg-white text-green-700 shadow-sm ring-1 ring-green-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title={scannerMode ? "Desactivar modo escaneo global" : "Activar modo escaneo global"}
              >
                {scannerMode && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-ping" />
                )}
                <Barcode className="w-4 h-4 inline mr-1.5" />
                {scannerMode ? "Escaneo activo" : "Escanear"}
              </button>
              <button
                onClick={() => setShowScannerHistory(!showScannerHistory)}
                className={`p-1.5 rounded-md transition-all relative ${
                  showScannerHistory
                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-blue-200"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="Historial de escaneos"
              >
                <History className="w-4 h-4" />
                {scannerHistory.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold ring-2 ring-white">
                    {Math.min(scannerHistory.length, 9)}
                  </span>
                )}
              </button>
            </div>
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        }
      />

        {showScannerHistory && scannerHistory.length > 0 && (
          <div className="absolute top-20 right-8 z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-700">Ultimos escaneos</span>
              <button
                onClick={() => setShowScannerHistory(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {scannerHistory.map((entry, i) => (
                <div key={`${entry.detected_at}-${i}`} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-medium text-slate-700 truncate">{entry.code}</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(entry.detected_at).toLocaleTimeString("es-AR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {PAYMENT_METHODS.map((m) => {
            const color = PAYMENT_METHOD_COLORS[m];
            const count = countByMethod[m];
            return (
              <div
                key={m}
                className="rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden"
                style={{
                  background: `linear-gradient(145deg, ${color}0a 0%, ${color}04 100%)`,
                }}
              >
                <div
                  className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.06] translate-x-8 -translate-y-8"
                  style={{ backgroundColor: color }}
                />
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: color }}>
                    {METHOD_ICONS[m]}
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color }}>{PAYMENT_METHOD_LABELS[m]}</p>
                    {count > 0 && <p className="text-[10px] text-slate-400">{count} venta{count !== 1 ? "s" : ""}</p>}
                  </div>
                </div>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(totalByMethod[m])}</p>
              </div>
            );
          })}
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 shadow-sm text-white hover:shadow-lg transition-all duration-300">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-xs font-medium text-blue-100">TOTAL</p>
            </div>
            <p className="text-xl font-bold">{formatCurrency(grandTotal)}</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100" />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="flex flex-col h-[70vh] min-h-[575px]">
            <div className="p-7 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-gradient-to-r from-slate-50/80 to-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Ventas del dia
                    {loading && (
                      <RefreshCw className="inline w-4 h-4 ml-2 animate-spin text-slate-400" />
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">{visibleActiveSales.length} activas · {visibleVoidedSales.length} anuladas</p>
                </div>
              </div>
                <label className="relative">
                  <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <select
                    value={salePaymentFilter}
                    onChange={(e) =>
                      setSalePaymentFilter(e.target.value as SalePaymentFilter)
                    }
                    className="h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium text-slate-600 outline-none transition-colors hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {SALE_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 space-y-4 animate-fade-in">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-4 px-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
                        <div className="space-y-2">
                          <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
                          <div className="h-2.5 w-16 rounded bg-slate-100 animate-pulse" />
                        </div>
                      </div>
                      <div className="h-4 w-20 rounded bg-slate-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : sales.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 animate-pulse">
                    <Plus className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Sin ventas para esta fecha</p>
                  <p className="text-xs mt-1.5 text-slate-400">
                    Escanea un código de barras o registra desde el panel lateral
                  </p>
                </div>
              ) : visibleSales.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 animate-pulse">
                    <Filter className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Sin ventas para este filtro</p>
                  <p className="text-xs mt-1.5 text-slate-400">
                    Cambia el medio de pago para ver otras ventas
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 animate-fade-in">
                  {visibleSales.map((sale) => (
                    <div
                      key={sale.id}
                      className={`flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/80 transition-all duration-200 group ${
                        sale.voided ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-110"
                          style={{
                            backgroundColor: sale.voided
                              ? "#cbd5e1"
                              : PAYMENT_METHOD_COLORS[sale.payment_method],
                          }}
                        >
                          {METHOD_ICONS[sale.payment_method] || <CreditCard className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {PAYMENT_METHOD_LABELS[sale.payment_method]}
                            </span>
                            {sale.voided && <Badge label="Anulada" color="red" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {sale.created_at && (
                              <span className="text-[11px] text-slate-400">
                                {new Date(sale.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {sale.notes && (
                              <span className="text-[11px] text-slate-400 truncate">· {sale.notes}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-base font-bold tabular-nums ${
                            sale.voided
                              ? "text-slate-400 line-through"
                              : "text-slate-900"
                          }`}
                        >
                          {formatCurrency(sale.amount)}
                        </span>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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

          <Card className="flex flex-col h-[70vh] min-h-[575px] xl:sticky xl:top-6">
            <div className="p-7 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-sm">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Registrar Nueva Venta
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {formatDate(filterDate)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-7">{renderSaleForm()}</div>
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
