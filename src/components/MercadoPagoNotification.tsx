import { useEffect, useRef, useState } from "react";
import { useMercadoPagoNotifications } from "../hooks/useMercadoPagoNotifications";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(n);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const paymentMethodLabels: Record<string, string> = {
  credit: "Tarjeta Crédito",
  debit: "Tarjeta Débito",
  account_money: "Cuenta MP",
  ticket: "Efectivo",
  bank_transfer: "Transferencia",
};

export function MercadoPagoNotification() {
  const { latestPayment, notifications, unreadCount, markAllRead, dismissLatest } =
    useMercadoPagoNotifications();
  const [showHistory, setShowHistory] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (latestPayment) {
      setShowToast(true);
      dismissLatest();
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setShowToast(false), 5000);
    }
  }, [latestPayment, dismissLatest]);

  return (
    <>
      {/* TOAST */}
      {showToast && latestPayment && (
        <div
          className="fixed bottom-24 right-6 z-[80] animate-in slide-in-from-right-4 fade-in-0 duration-300"
          onClick={() => setShowHistory(true)}
        >
          <div className="w-80 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-xl">
            <div className="flex items-center gap-3 bg-emerald-600 px-4 py-3 text-white">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                $
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Pago recibido</p>
                <p className="text-xs text-emerald-100 truncate">
                  {latestPayment.payer_email || "Cliente"}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowToast(false);
                }}
                className="rounded-lg p-1 text-emerald-100 hover:bg-white/10"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-lg font-bold text-slate-900">
                {formatCurrency(latestPayment.amount)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {paymentMethodLabels[latestPayment.payment_method] || latestPayment.payment_method}
                {" · "}
                {formatTime(latestPayment.created_at)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* BOTON FLOTANTE */}
      <div className="fixed bottom-6 right-6 z-[70] flex flex-col items-end gap-2">
        {unreadCount > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        )}
        <button
          onClick={() => {
            setShowHistory((v) => !v);
            if (!showHistory) markAllRead();
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700"
          title="Pagos Mercado Pago"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* HISTORIAL */}
      {showHistory && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">Pagos Mercado Pago</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {notifications.length} recepciones
                </p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-slate-400">
                  <svg className="mb-3 h-10 w-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Aun no hay pagos recibidos</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((n, i) => (
                    <div key={`${n.payment.payment_id}-${i}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                        $
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatCurrency(n.payment.amount)}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {paymentMethodLabels[n.payment.payment_method] || n.payment.payment_method}
                          {n.payment.payer_email ? ` · ${n.payment.payer_email}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatDate(n.payment.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 px-5 py-3">
              <p className="text-[11px] text-slate-400 text-center">
                Los pagos se registran automaticamente via Mercado Pago
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
