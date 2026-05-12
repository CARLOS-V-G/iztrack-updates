import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Cloud,
  DownloadCloud,
  FileDown,
  History,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Toast } from "../components/ui/Toast";
import {
  BackupData,
  BackupRecord,
} from "../lib/cloudBackup";
import { supabase } from "../lib/supabase";

type BackupOperation = "idle" | "checking" | "saving" | "restoring";

type ToastState = {
  message: string;
  type: "success" | "error" | "warning";
};

type RestoreTarget = {
  id: string;
  label: string;
};

const AUTO_BACKUP_INTERVAL_MINUTES = 5;
const BACKUP_LIST_COLUMNS =
  "id, created_at, source, sales_count, expenses_count, compressed_bytes, uncompressed_bytes";

function getUserId() {
  return localStorage.getItem("userId");
}

function formatDateAR(dateString: string | null) {
  if (!dateString) return "Sin datos";

  const fixed = dateString.includes("T")
    ? dateString
    : dateString.replace(" ", "T");
  const withTimezone =
    fixed.includes("Z") || fixed.includes("+") ? fixed : `${fixed}Z`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) return "Fecha invalida";

  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function getBackupSourceLabel(source?: string | null) {
  if (source === "automatic") return "Automatico";
  if (source === "migration") return "Migracion";
  if (source === "manual") return "Manual";

  return "Sin metadata";
}

function getBackupSourceColor(source?: string | null) {
  if (source === "automatic") return "bg-green-100 text-green-700";
  if (source === "migration") return "bg-amber-100 text-amber-700";
  if (source === "manual") return "bg-blue-100 text-blue-700";

  return "bg-slate-100 text-slate-600";
}

function getBackupRecordSource(backup: BackupRecord) {
  return backup.source || backup.data?.meta?.source || null;
}

function getBackupStats(backup: BackupRecord) {
  if (
    backup.sales_count !== undefined &&
    backup.sales_count !== null &&
    backup.expenses_count !== undefined &&
    backup.expenses_count !== null
  ) {
    return {
      salesCount: backup.sales_count,
      expensesCount: backup.expenses_count,
      size: formatBytes(backup.compressed_bytes || 0),
    };
  }

  const data = backup.data;
  if (!data) return null;

  if ("format" in data && data.format === "gzip-base64") {
    return {
      salesCount: data.meta.sales_count,
      expensesCount: data.meta.expenses_count,
      size: formatBytes(data.meta.compressed_bytes || 0),
    };
  }

  const backupData = data as BackupData;
  const salesCount = backupData.meta?.sales_count ?? backupData.sales?.length ?? 0;
  const expensesCount =
    backupData.meta?.expenses_count ?? backupData.expenses?.length ?? 0;
  const size = formatBytes(new Blob([JSON.stringify(backupData)]).size);

  return { salesCount, expensesCount, size };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  return "Ocurrio un error inesperado";
}

export function SettingsPage() {
  const [operation, setOperation] = useState<BackupOperation>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [backupError, setBackupError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [lastAutoBackupAt, setLastAutoBackupAt] = useState<string | null>(null);
  const [lastAutoBackupLocalAt, setLastAutoBackupLocalAt] = useState<
    string | null
  >(null);
  const [lastAutoBackupError, setLastAutoBackupError] = useState<string | null>(
    null,
  );
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);

  const latestBackup = backups[0];
  const busy = operation !== "idle";

  const nextAutoBackupAt = useMemo(() => {
    if (!lastAutoBackupAt) return null;

    const lastDate = new Date(lastAutoBackupAt);
    if (Number.isNaN(lastDate.getTime())) return null;

    return new Date(
      lastDate.getTime() + AUTO_BACKUP_INTERVAL_MINUTES * 60 * 1000,
    ).toISOString();
  }, [lastAutoBackupAt]);

  const refreshAutoBackupState = useCallback(() => {
    setLastAutoBackupAt(localStorage.getItem("last_auto_backup_at"));
    setLastAutoBackupLocalAt(localStorage.getItem("last_auto_backup_local_at"));
    setLastAutoBackupError(localStorage.getItem("last_auto_backup_error"));
  }, []);

  const refreshUpdateStatus = useCallback(async () => {
    const status = await window.api.getUpdateStatus();
    setUpdateStatus(status);
  }, []);

  const loadBackups = useCallback(async (silent = false) => {
    const userId = getUserId();

    if (!userId) {
      setBackups([]);
      setBackupError("No se encontro usuario vinculado para consultar backups.");
      return;
    }

    if (!silent) {
      setOperation("checking");
      setStatusMessage("Verificando historial de backups en la nube...");
      setBackupError("");
    }

    let usedMetadataFallback = false;
    const primaryResult = await supabase
      .from("backups")
      .select(BACKUP_LIST_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    let data = primaryResult.data as BackupRecord[] | null;
    let error = primaryResult.error;

    if (
      error &&
      /source|sales_count|expenses_count|compressed_bytes|uncompressed_bytes/i.test(
        error.message,
      )
    ) {
      const fallback = await supabase
        .from("backups")
        .select("id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      data = fallback.data as BackupRecord[] | null;
      error = fallback.error;

      if (!fallback.error) {
        usedMetadataFallback = true;
        setStatusMessage(
          "Historial verificado sin metadata. Aplica la migracion de backups para ver si fue manual o automatico.",
        );
      }
    }

    if (error) {
      setBackups([]);
      setBackupError(error.message);
      setStatusMessage("No se pudo verificar el historial de backups.");
      if (!silent) setOperation("idle");
      return;
    }

    setBackups((data || []) as BackupRecord[]);
    if (!usedMetadataFallback) {
      setStatusMessage(
        data?.length
          ? `Historial verificado: ${data.length} backups encontrados.`
          : "Historial verificado: no hay backups disponibles.",
      );
    }

    if (!silent) setOperation("idle");
  }, []);

  async function handleBackup() {
    const userId = getUserId();

    if (!userId) {
      setToast({
        type: "error",
        message: "Usuario no encontrado para crear backup.",
      });
      return;
    }

    setOperation("saving");
    setStatusMessage("Preparando datos y guardando backup en la nube...");
    setBackupError("");

    try {
      const result = await window.api.createBackup({
        userId,
        source: "manual",
      });

      if (!result.ok) {
        throw new Error(result.error || "No se pudo crear el backup.");
      }

      localStorage.setItem("last_manual_backup_at", new Date().toISOString());
      setToast({
        type: result.cloudOk ? "success" : "warning",
        message: result.message,
      });
      const statsText = result.stats
        ? `${result.stats.sales_count} ventas, ${result.stats.expenses_count} gastos, ${formatBytes(result.stats.compressed_bytes)} comprimido`
        : "";
      setStatusMessage(
        result.cloudOk
          ? `Backup manual guardado en nube. ${statsText}`
          : `Backup local creado. ${statsText}. ${result.error || "La nube no respondio."}`,
      );
      await loadBackups(true);
    } catch (error) {
      const message = getErrorMessage(error);
      setBackupError(message);
      setStatusMessage("No se pudo guardar el backup.");
      setToast({ type: "error", message });
    } finally {
      setOperation("idle");
    }
  }

  function requestRestore(target: RestoreTarget) {
    setRestoreTarget(target);
    setShowConfirm(true);
  }

  async function handleRestoreConfirm() {
    if (!restoreTarget) return;

    const userId = getUserId();

    if (!userId) {
      setShowConfirm(false);
      setToast({
        type: "error",
        message: "Usuario no encontrado para restaurar backup.",
      });
      return;
    }

    setShowConfirm(false);
    setOperation("restoring");
      setStatusMessage("Descargando backup completo antes de restaurar...");
    setBackupError("");

    try {
      const restoreResult = await window.api.restoreCloudBackup({
        userId,
        backupId: restoreTarget.id,
      });

      if (!restoreResult.ok) {
        throw new Error(
          restoreResult.error || "No se pudo escribir el backup en la base local.",
        );
      }

      setToast({
        type: "success",
        message: restoreResult.message,
      });
      setStatusMessage("Backup restaurado. Reiniciando vista...");

      setTimeout(() => location.reload(), 1500);
    } catch (error) {
      const message = getErrorMessage(error);
      setBackupError(message);
      setStatusMessage("No se pudo restaurar el backup.");
      setToast({ type: "error", message });
      setOperation("idle");
    }
  }

  useEffect(() => {
    refreshAutoBackupState();
    loadBackups();

    const interval = setInterval(refreshAutoBackupState, 10000);
    return () => clearInterval(interval);
  }, [loadBackups, refreshAutoBackupState]);

  useEffect(() => {
    refreshUpdateStatus().catch(() => undefined);
    const unsubscribe = window.api.onUpdateStatus(setUpdateStatus);

    return unsubscribe;
  }, [refreshUpdateStatus]);

  async function handleCheckUpdates() {
    setUpdateBusy(true);
    try {
      const status = await window.api.checkForUpdates();
      setUpdateStatus(status);

      if (!status.supported) {
        setToast({
          type: "warning",
          message: status.message || "Las actualizaciones se activan en la app instalada.",
        });
      } else if (status.state === "not-available") {
        setToast({ type: "success", message: "Ya tienes la ultima version." });
      }
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleDownloadUpdate() {
    setUpdateBusy(true);
    try {
      setUpdateStatus(await window.api.downloadUpdate());
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleInstallUpdate() {
    setUpdateBusy(true);
    try {
      setUpdateStatus(await window.api.installUpdate());
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleExportDiagnostics() {
    setDiagnosticBusy(true);

    try {
      const result = await window.api.exportDiagnostics({
        userId: getUserId(),
        backupsVisibleCount: backups.length,
        latestCloudBackup: latestBackup
          ? {
              id: latestBackup.id,
              created_at: latestBackup.created_at,
              source: getBackupRecordSource(latestBackup),
              sales_count: latestBackup.sales_count ?? null,
              expenses_count: latestBackup.expenses_count ?? null,
            }
          : null,
        lastAutoBackupAt,
        lastAutoBackupLocalAt,
        lastAutoBackupError,
        updateStatus,
      });

      if (result.ok) {
        setToast({
          type: "success",
          message: result.message,
        });
      } else if (!result.cancelled) {
        setToast({
          type: "error",
          message: result.message,
        });
      }
    } catch (error) {
      setToast({
        type: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuracion</h1>
          <p className="text-sm text-slate-500">
            Administra tu sistema, backups y licencia
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => loadBackups()}
          disabled={busy}
        >
          <RefreshCw
            className={`w-4 h-4 ${operation === "checking" ? "animate-spin" : ""}`}
          />
          Verificar backups
        </Button>
      </div>

      {(statusMessage || backupError || busy) && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
            backupError
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-blue-50 border-blue-200 text-blue-700"
          }`}
        >
          {backupError ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          ) : busy ? (
            <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
          ) : (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">
              {backupError ? "Atencion en backups" : statusMessage}
            </p>
            {backupError && <p className="text-xs mt-0.5">{backupError}</p>}
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Cloud className="text-blue-600" />
              <div>
                <h2 className="font-semibold text-slate-800">
                  Backup en la nube
                </h2>
                <p className="text-sm text-slate-500">
                  Guarda y restaura tus datos de forma segura
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Ultimo backup</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">
                  {latestBackup ? formatDateAR(latestBackup.created_at) : "Sin backups"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Tipo ultimo backup</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">
                  {latestBackup
                    ? getBackupSourceLabel(getBackupRecordSource(latestBackup))
                    : "Sin datos"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Backup automatico</p>
                <p className="text-sm font-semibold text-green-700 mt-1">
                  Activo cada {AUTO_BACKUP_INTERVAL_MINUTES} min
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Proxima referencia</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">
                  {nextAutoBackupAt
                    ? formatDateAR(nextAutoBackupAt)
                    : "Esperando primer backup"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleBackup}
                disabled={busy}
                loading={operation === "saving"}
              >
                Guardar Backup
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  requestRestore({
                    id: "latest",
                    label: "el ultimo backup disponible",
                  })
                }
                disabled={busy || backups.length === 0}
              >
                <RotateCcw className="w-4 h-4" />
                Restaurar ultimo
              </Button>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <History className="text-slate-600" />
                <div>
                  <h2 className="font-semibold text-slate-800">
                    Historial de backups
                  </h2>
                  <p className="text-sm text-slate-500">
                    Ultimos 10 backups guardados en Supabase
                  </p>
                </div>
              </div>
            </div>

            {operation === "checking" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3 text-blue-700">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">
                  Verificando historial de backups...
                </span>
              </div>
            )}

            {backups.length === 0 && operation !== "checking" ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <Cloud className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  No hay backups disponibles
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Crea uno manualmente o espera al backup automatico.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map((backup) => {
                  const stats = getBackupStats(backup);
                  const source = getBackupRecordSource(backup);

                  return (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">
                            {formatDateAR(backup.created_at)}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${getBackupSourceColor(source)}`}
                          >
                            {getBackupSourceLabel(source)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
                            Nube
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {stats
                            ? `${stats.salesCount} ventas - ${stats.expensesCount} gastos - ${stats.size}`
                            : "Backup disponible - los datos completos se cargan solo al restaurar"}
                        </p>
                      </div>

                      <button
                        onClick={() =>
                          requestRestore({
                            id: backup.id,
                            label: `backup del ${formatDateAR(backup.created_at)}`,
                          })
                        }
                        disabled={busy}
                        className="text-blue-600 text-sm font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Restaurar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Clock className="text-blue-600" />
              <h2 className="font-semibold text-slate-800">
                Estado automatico
              </h2>
            </div>

            <div className="text-sm text-slate-600 space-y-3">
              <div>
                <p className="text-xs text-slate-500">Ultimo automatico</p>
                <p className="font-medium text-slate-800">
                  {lastAutoBackupAt
                    ? formatDateAR(lastAutoBackupAt)
                    : lastAutoBackupLocalAt
                      ? `${formatDateAR(lastAutoBackupLocalAt)} (local)`
                      : "Aun no registrado en esta sesion"}
                </p>
              </div>

              {lastAutoBackupError ? (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-red-700">
                  <p className="text-xs font-medium">Ultimo error</p>
                  <p className="text-xs mt-1">{lastAutoBackupError}</p>
                </div>
              ) : (
                <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-green-700">
                  <p className="text-xs font-medium">
                    El backup automatico esta activo mientras la app esta abierta.
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-green-600" />
              <h2 className="font-semibold text-slate-800">Licencia</h2>
            </div>
            <div className="text-sm">
              <p className="text-slate-600">
                Estado:{" "}
                <span className="text-green-600 font-semibold">Activa</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Usuario vinculado al sistema
              </p>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <DownloadCloud className="text-blue-600" />
              <h2 className="font-semibold text-slate-800">
                Actualizaciones
              </h2>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <p className="text-xs text-slate-500">Version instalada</p>
                <p className="font-medium text-slate-800">
                  izTrack {updateStatus?.currentVersion || "1.0.0"}
                </p>
              </div>

              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  updateStatus?.state === "available" ||
                  updateStatus?.state === "downloaded"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : updateStatus?.state === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {updateStatus?.state === "available" &&
                  `Disponible v${updateStatus.availableVersion}`}
                {updateStatus?.state === "downloading" &&
                  `Descargando ${Math.round(updateStatus.percent)}%`}
                {updateStatus?.state === "downloaded" &&
                  "Lista para instalar"}
                {updateStatus?.state === "not-available" &&
                  (updateStatus.message || "No hay actualizaciones disponibles")}
                {updateStatus?.state === "checking" &&
                  "Verificando actualizaciones..."}
                {updateStatus?.state === "error" &&
                  (updateStatus.error || "No se pudo verificar")}
                {(!updateStatus || updateStatus.state === "idle") &&
                  "Sin verificacion reciente"}
                {updateStatus?.state === "unsupported" &&
                  updateStatus.message}
              </div>

              {updateStatus?.state === "downloading" && (
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.round(updateStatus.percent)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {updateStatus?.state === "available" ? (
                <Button
                  size="sm"
                  onClick={handleDownloadUpdate}
                  loading={updateBusy}
                >
                  Descargar
                </Button>
              ) : updateStatus?.state === "downloading" ? (
                <Button size="sm" disabled loading>
                  Descargando
                </Button>
              ) : updateStatus?.state === "downloaded" ? (
                <Button
                  size="sm"
                  onClick={handleInstallUpdate}
                  loading={updateBusy}
                >
                  Instalar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCheckUpdates}
                  loading={updateBusy || updateStatus?.state === "checking"}
                >
                  <RefreshCw className="w-4 h-4" />
                  Verificar
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Settings className="text-slate-600" />
              <h2 className="font-semibold text-slate-800">Sistema</h2>
            </div>
            <div className="text-sm text-slate-600">
              <p>Version: izTrack v1.0</p>
              <p className="text-xs text-slate-400 mt-1">
                Ultima actualizacion instalada
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportDiagnostics}
              loading={diagnosticBusy}
            >
              <FileDown className="w-4 h-4" />
              Exportar diagnostico
            </Button>
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        title="Restaurar datos"
        message={`Esto reemplazara todos los datos actuales con ${restoreTarget?.label || "el backup seleccionado"}.`}
        onCancel={() => {
          setShowConfirm(false);
          setRestoreTarget(null);
        }}
        onConfirm={handleRestoreConfirm}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
