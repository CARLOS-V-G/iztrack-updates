import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";

import { Button } from "./ui/Button";

function formatDeadline(status: AppUpdateStatus) {
  if (!status.mandatoryAt) return "";

  const diff = new Date(status.mandatoryAt).getTime() - Date.now();
  if (diff <= 0) return "Actualizacion obligatoria";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.max(1, Math.ceil((diff % (1000 * 60 * 60)) / (1000 * 60)));

  if (hours <= 0) return `Quedan ${minutes} min para posponer`;
  return `Quedan ${hours} h ${minutes} min para posponer`;
}

function formatBytes(value: number) {
  if (!value) return "";

  const mb = value / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;

  return `${Math.round(value / 1024)} KB`;
}

export function UpdateManager() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await window.api.getUpdateStatus();
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    let mounted = true;

    refreshStatus().catch(() => undefined);

    const unsubscribe = window.api.onUpdateStatus((nextStatus) => {
      if (!mounted) return;

      setStatus(nextStatus);
      if (
        nextStatus.isMandatory ||
        nextStatus.state === "available" ||
        nextStatus.state === "downloading" ||
        nextStatus.state === "downloaded"
      ) {
        setHidden(false);
      }
    });

    const checkTimer = window.setTimeout(() => {
      window.api.checkForUpdates().then(setStatus).catch(() => undefined);
    }, 5000);

    const refreshTimer = window.setInterval(() => {
      refreshStatus().catch(() => undefined);
    }, 60000);

    return () => {
      mounted = false;
      unsubscribe();
      window.clearTimeout(checkTimer);
      window.clearInterval(refreshTimer);
    };
  }, [refreshStatus]);

  const details = useMemo(() => {
    if (!status) {
      return {
        title: "Actualizaciones",
        description: "",
        icon: <DownloadCloud className="h-5 w-5" />,
      };
    }

    if (status.isMandatory) {
      return {
        title: "Actualizacion requerida",
        description:
          "Ya pasaron 24 horas desde que se detecto esta version. Para seguir usando izTrack hay que actualizar.",
        icon: <ShieldAlert className="h-5 w-5" />,
      };
    }

    if (status.state === "downloaded") {
      const countdown = status.autoInstallCountdown || 0;
      const desc =
        countdown > 0
          ? `La descarga termino. izTrack se reiniciara automaticamente en ${countdown} segundos para instalar la actualizacion.`
          : "La descarga termino. Reinicia izTrack para instalar la nueva version.";
      return {
        title: "Actualizacion lista",
        description: desc,
        icon: <CheckCircle2 className="h-5 w-5" />,
      };
    }

    if (status.state === "downloading") {
      return {
        title: "Descargando actualizacion",
        description: "Puedes seguir trabajando mientras se descarga.",
        icon: <DownloadCloud className="h-5 w-5" />,
      };
    }

    if (status.state === "error") {
      return {
        title: "No se pudo actualizar",
        description:
          status.error || "Revisa la conexion e intenta verificar nuevamente.",
        icon: <AlertTriangle className="h-5 w-5" />,
      };
    }

    return {
      title: "Nueva actualizacion disponible",
      description:
        "Se puede descargar ahora. Para aplicar el cambio la app se reinicia al final.",
      icon: <DownloadCloud className="h-5 w-5" />,
    };
  }, [status]);

  if (!status?.supported) return null;

  const hasVisibleError = status.state === "error" && Boolean(status.availableVersion);
  const shouldShow =
    status.isMandatory ||
    status.state === "available" ||
    status.state === "downloading" ||
    status.state === "downloaded" ||
    hasVisibleError;

  if (!shouldShow || (hidden && !status.isMandatory && status.state === "available")) {
    return null;
  }

  const isBlocking = status.isMandatory;
  const percent = Math.round(status.percent || 0);
  const versionLabel = status.availableVersion
    ? `v${status.availableVersion}`
    : "nueva version";
  const deadlineLabel = formatDeadline(status);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const nextStatus = await window.api.downloadUpdate();
      setStatus(nextStatus);
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    setBusy(true);
    try {
      const nextStatus = await window.api.installUpdate();
      setStatus(nextStatus);
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setBusy(true);
    try {
      const nextStatus = await window.api.checkForUpdates();
      setStatus(nextStatus);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setHidden(true);
    await window.api.dismissUpdate();
  };

  const content = (
    <section
      className={`w-full max-w-[440px] overflow-hidden rounded-lg border bg-white shadow-2xl ${
        isBlocking ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className={`${isBlocking ? "bg-red-600" : "bg-slate-900"} px-5 py-4 text-white`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-white/15 p-2">{details.icon}</div>
            <div>
              <p className="text-sm font-semibold">{details.title}</p>
              <p className="mt-1 text-xs text-white/75">
                izTrack {status.currentVersion} a {versionLabel}
              </p>
            </div>
          </div>

          {!isBlocking && status.state === "available" && (
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Cerrar aviso de actualizacion"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-sm leading-6 text-slate-600">{details.description}</p>

        {deadlineLabel && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              status.isMandatory
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {deadlineLabel}
          </div>
        )}

        {(status.state === "downloading" || status.state === "downloaded") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{status.state === "downloaded" ? "Descarga completa" : "Descargando"}</span>
              <span className="font-semibold text-slate-700">{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            {status.total > 0 && (
              <p className="text-[11px] text-slate-400">
                {formatBytes(status.transferred)} de {formatBytes(status.total)}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {status.state === "available" && (
            <Button onClick={handleDownload} loading={busy} className="flex-1">
              <DownloadCloud className="h-4 w-4" />
              Descargar
            </Button>
          )}

          {status.state === "downloading" && (
            <Button disabled loading className="flex-1">
              Descargando
            </Button>
          )}

          {status.state === "downloaded" && (
            <Button onClick={handleInstall} loading={busy} className="flex-1">
              <RotateCcw className="h-4 w-4" />
              {status.autoInstallCountdown > 0
                ? `Reiniciar ahora (${status.autoInstallCountdown}s)`
                : "Instalar y reiniciar"}
            </Button>
          )}

          {hasVisibleError && (
            <Button onClick={handleRetry} loading={busy} className="flex-1">
              <RefreshCw className="h-4 w-4" />
              Verificar otra vez
            </Button>
          )}

          {!isBlocking && status.state === "available" && (
            <Button type="button" variant="secondary" onClick={handleDismiss}>
              Luego
            </Button>
          )}
        </div>
      </div>
    </section>
  );

  if (isBlocking) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return <div className="fixed bottom-6 right-6 z-[70] px-4 sm:px-0">{content}</div>;
}
