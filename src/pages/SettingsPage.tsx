import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  CheckCircle,
  Clock,
  Cloud,
  CloudOff,
  DownloadCloud,
  FileDown,
  History,
  Link2,
  Link2Off,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Timer,
  Monitor,
  KeyRound,
  Check,
  X,
  Copy,
  ChevronRight,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Toast } from "../components/ui/Toast";
import { BackupData, BackupRecord } from "../lib/cloudBackup";
import { supabase } from "../lib/supabase";

type BackupOperation = "idle" | "checking" | "saving" | "restoring";

type ToastState = { message: string; type: "success" | "error" | "warning" };

type RestoreTarget = { id: string; label: string };

const AUTO_BACKUP_INTERVAL_MINUTES = 5;
const BACKUP_LIST_COLUMNS =
  "id, created_at, source, sales_count, expenses_count, compressed_bytes, uncompressed_bytes";

function getUserId() {
  return localStorage.getItem("userId");
}

function formatDateAR(dateString: string | null) {
  if (!dateString) return "Sin datos";
  const fixed = dateString.includes("T") ? dateString : dateString.replace(" ", "T");
  const withTimezone = fixed.includes("Z") || fixed.includes("+") ? fixed : `${fixed}Z`;
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
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function getBackupSourceLabel(source?: string | null) {
  if (source === "automatic") return "Automatico";
  if (source === "migration") return "Migracion";
  if (source === "manual") return "Manual";
  return "Sin metadata";
}

function getBackupSourceColor(source?: string | null) {
  if (source === "automatic") return "bg-emerald-100 text-emerald-700";
  if (source === "migration") return "bg-amber-100 text-amber-700";
  if (source === "manual") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function getBackupSourceIcon(source?: string | null) {
  if (source === "automatic") return <RefreshCw size={12} />;
  if (source === "migration") return <DownloadCloud size={12} />;
  if (source === "manual") return <Cloud size={12} />;
  return null;
}

function getBackupRecordSource(backup: BackupRecord) {
  return backup.source || backup.data?.meta?.source || null;
}

function getBackupStats(backup: BackupRecord) {
  if (backup.sales_count !== undefined && backup.sales_count !== null && backup.expenses_count !== undefined && backup.expenses_count !== null) {
    return { salesCount: backup.sales_count, expensesCount: backup.expenses_count, size: formatBytes(backup.compressed_bytes || 0) };
  }
  const data = backup.data;
  if (!data) return null;
  if ("format" in data && data.format === "gzip-base64") {
    return { salesCount: data.meta.sales_count, expensesCount: data.meta.expenses_count, size: formatBytes(data.meta.compressed_bytes || 0) };
  }
  const backupData = data as BackupData;
  const salesCount = backupData.meta?.sales_count ?? backupData.sales?.length ?? 0;
  const expensesCount = backupData.meta?.expenses_count ?? backupData.expenses?.length ?? 0;
  return { salesCount, expensesCount, size: formatBytes(new Blob([JSON.stringify(backupData)]).size) };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Ocurrio un error inesperado";
}

type LinkState = "idle" | "generating" | "waiting" | "linked" | "error";

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: "green" | "red" | "amber" | "blue" | "slate" }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[color]}`}>{label}</span>;
}

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 flex items-center gap-2">{icon}{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
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
  const [lastAutoBackupLocalAt, setLastAutoBackupLocalAt] = useState<string | null>(null);
  const [lastAutoBackupError, setLastAutoBackupError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [scannerConfig, setScannerConfig] = useState<ScannerConfig | null>(null);
  const [scannerHistory, setScannerHistory] = useState<ScannerHistoryEntry[]>([]);
  const [scannerBackend, setScannerBackend] = useState("");
  const [savingScannerConfig, setSavingScannerConfig] = useState(false);

  const [linkState, setLinkState] = useState<LinkState>(() => {
    const stored = localStorage.getItem("pending_link_token");
    const startedAt = localStorage.getItem("pending_link_started_at");
    if (stored && startedAt) {
      const elapsed = (Date.now() - Number(startedAt)) / 1000;
      const expiresIn = Number(localStorage.getItem("pending_link_expires_in")) || 600;
      if (elapsed < expiresIn) return "waiting";
      localStorage.removeItem("pending_link_token");
      localStorage.removeItem("pending_link_started_at");
      localStorage.removeItem("pending_link_expires_in");
    }
    return "idle";
  });
  const [linkToken, setLinkToken] = useState(() => localStorage.getItem("pending_link_token") || "");
  const [linkError, setLinkError] = useState("");
  const [linkCountdown, setLinkCountdown] = useState(() => {
    const startedAt = localStorage.getItem("pending_link_started_at");
    const expiresIn = Number(localStorage.getItem("pending_link_expires_in")) || 600;
    if (startedAt) {
      const remaining = Math.max(0, expiresIn - Math.floor((Date.now() - Number(startedAt)) / 1000));
      return remaining;
    }
    return 600;
  });
  const [linkCopied, setLinkCopied] = useState(false);

  const [linkedInfo, setLinkedInfo] = useState<{ company_id?: string; branch_id?: string; branch_name?: string } | null>(null);

  const latestBackup = backups[0];
  const busy = operation !== "idle";

  const nextAutoBackupAt = useMemo(() => {
    if (!lastAutoBackupAt) return null;
    const lastDate = new Date(lastAutoBackupAt);
    if (Number.isNaN(lastDate.getTime())) return null;
    return new Date(lastDate.getTime() + AUTO_BACKUP_INTERVAL_MINUTES * 60 * 1000).toISOString();
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
    if (error && /source|sales_count|expenses_count|compressed_bytes|uncompressed_bytes/i.test(error.message)) {
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
        setStatusMessage("Historial verificado sin metadata.");
      }
    }
    if (error) {
      setBackups([]);
      setBackupError(error.message);
      setStatusMessage("No se pudo verificar el historial.");
      if (!silent) setOperation("idle");
      return;
    }
    setBackups((data || []) as BackupRecord[]);
    if (!usedMetadataFallback) {
      setStatusMessage(data?.length ? `Historial verificado: ${data.length} backups.` : "No hay backups disponibles.");
    }
    if (!silent) setOperation("idle");
  }, []);

  async function handleBackup() {
    const userId = getUserId();
    if (!userId) {
      setToast({ type: "error", message: "Usuario no encontrado." });
      return;
    }
    setOperation("saving");
    setStatusMessage("Guardando backup en la nube...");
    setBackupError("");
    try {
      const result = await window.api.createBackup({ userId, source: "manual" });
      if (!result.ok) throw new Error(result.error || "No se pudo crear el backup.");
      localStorage.setItem("last_manual_backup_at", new Date().toISOString());
      setToast({ type: result.cloudOk ? "success" : "warning", message: result.message });
      setStatusMessage(result.cloudOk ? "Backup manual guardado en nube." : `Backup local creado. ${result.error || ""}`);
      await loadBackups(true);
    } catch (error) {
      const message = getErrorMessage(error);
      setBackupError(message);
      setStatusMessage("No se pudo guardar el backup.");
      setToast({ type: "error", message });
    } finally { setOperation("idle"); }
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
      setToast({ type: "error", message: "Usuario no encontrado." });
      return;
    }
    setShowConfirm(false);
    setOperation("restoring");
    setStatusMessage("Descargando backup...");
    setBackupError("");
    try {
      const result = await window.api.restoreCloudBackup({ userId, backupId: restoreTarget.id });
      if (!result.ok) throw new Error(result.error || "No se pudo restaurar.");
      setToast({ type: "success", message: result.message });
      setStatusMessage("Backup restaurado.");
      setTimeout(() => location.reload(), 1500);
    } catch (error) {
      const message = getErrorMessage(error);
      setBackupError(message);
      setStatusMessage("No se pudo restaurar.");
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

  useEffect(() => {
    Promise.all([
      window.api.getScannerConfig(),
      window.api.getScannerHistory(),
      window.api.getScannerBackend(),
    ]).then(([config, history, backend]) => {
      setScannerConfig(config);
      setScannerHistory(history || []);
      setScannerBackend(backend);
    }).catch(() => undefined);
  }, []);

  // Check link state on mount — only from pairing flow, NOT from license
  useEffect(() => {
    const linked = localStorage.getItem("cloud_linked");
    if (linked === "true") {
      const cid = localStorage.getItem("cloud_company_id");
      const bid = localStorage.getItem("cloud_branch_id");
      if (cid && bid) {
        setLinkedInfo({ company_id: cid, branch_id: bid, branch_name: localStorage.getItem("cloud_branch_name") || undefined });
        setLinkState("linked");
      }
    }
  }, []);

  // Countdown timer for link code
  useEffect(() => {
    if (linkState !== "waiting") return;
    const startedAt = Number(localStorage.getItem("pending_link_started_at"));
    const expiresIn = Number(localStorage.getItem("pending_link_expires_in")) || 600;
    if (!startedAt) return;
    const tick = () => {
      const remaining = Math.max(0, expiresIn - Math.floor((Date.now() - startedAt) / 1000));
      setLinkCountdown(remaining);
      if (remaining <= 0) {
        setLinkState("idle");
        setLinkError("El codigo expiro. Genera uno nuevo.");
        localStorage.removeItem("pending_link_token");
        localStorage.removeItem("pending_link_started_at");
        localStorage.removeItem("pending_link_expires_in");
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [linkState]);

  // Poll for link confirmation
  useEffect(() => {
    if (linkState !== "waiting" || !linkToken) return;
    const poll = setInterval(async () => {
      const result = await window.api.checkLinkStatus(linkToken);
      if (result.status === "linked") {
        clearInterval(poll);
        localStorage.removeItem("pending_link_token");
        localStorage.removeItem("pending_link_started_at");
        localStorage.removeItem("pending_link_expires_in");
        localStorage.setItem("cloud_linked", "true");
        localStorage.setItem("cloud_company_id", result.company_id);
        localStorage.setItem("cloud_branch_id", result.branch_id);
        setLinkedInfo({ company_id: result.company_id, branch_id: result.branch_id });
        setLinkState("linked");
        setToast({ type: "success", message: "Sucursal vinculada correctamente." });
      } else if (result.status === "expired") {
        clearInterval(poll);
        localStorage.removeItem("pending_link_token");
        localStorage.removeItem("pending_link_started_at");
        localStorage.removeItem("pending_link_expires_in");
        setLinkState("idle");
        setLinkError("El codigo expiro. Genera uno nuevo.");
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [linkState, linkToken]);

  async function handleGenerateLink() {
    setLinkState("generating");
    setLinkError("");
    setLinkToken("");
    localStorage.removeItem("pending_link_token");
    localStorage.removeItem("pending_link_started_at");
    localStorage.removeItem("pending_link_expires_in");
    try {
      const result = await window.api.generateLinkCode();
      if (!result.ok) {
        setLinkState("idle");
        setLinkError(result.error || "Error al generar codigo");
        return;
      }
      const startedAt = Date.now();
      const expiresIn = result.expires_in || 600;
      localStorage.setItem("pending_link_token", result.token);
      localStorage.setItem("pending_link_started_at", String(startedAt));
      localStorage.setItem("pending_link_expires_in", String(expiresIn));
      setLinkToken(result.token);
      setLinkCountdown(expiresIn);
      setLinkState("waiting");
    } catch {
      setLinkState("idle");
      setLinkError("Error de conexion con el servidor");
    }
  }

  async function copyLinkCode() {
    if (!linkToken) return;
    try {
      await navigator.clipboard.writeText(linkToken);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* no clipboard */ }
  }

  async function handleCheckUpdates() {
    setUpdateBusy(true);
    try {
      const status = await window.api.checkForUpdates();
      setUpdateStatus(status);
      if (!status.supported) {
        setToast({ type: "warning", message: status.message || "Actualizaciones solo en app instalada." });
      } else if (status.state === "not-available") {
        setToast({ type: "success", message: "Ya tienes la ultima version." });
      }
    } finally { setUpdateBusy(false); }
  }

  async function handleDownloadUpdate() {
    setUpdateBusy(true);
    try { setUpdateStatus(await window.api.downloadUpdate()); } finally { setUpdateBusy(false); }
  }

  async function handleInstallUpdate() {
    setUpdateBusy(true);
    try { setUpdateStatus(await window.api.installUpdate()); } finally { setUpdateBusy(false); }
  }

  async function handleExportDiagnostics() {
    setDiagnosticBusy(true);
    try {
      const result = await window.api.exportDiagnostics({
        userId: getUserId(),
        backupsVisibleCount: backups.length,
        latestCloudBackup: latestBackup ? { id: latestBackup.id, created_at: latestBackup.created_at, source: getBackupRecordSource(latestBackup), sales_count: latestBackup.sales_count ?? null, expenses_count: latestBackup.expenses_count ?? null } : null,
        lastAutoBackupAt, lastAutoBackupLocalAt, lastAutoBackupError, updateStatus,
      });
      if (result.ok) { setToast({ type: "success", message: result.message }); }
      else if (!result.cancelled) { setToast({ type: "error", message: result.message }); }
    } catch (error) { setToast({ type: "error", message: getErrorMessage(error) }); }
    finally { setDiagnosticBusy(false); }
  }

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-8 space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuracion</h1>
          <p className="text-sm text-slate-500 mt-1">Administra tu sistema, backups, nube y licencia</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => loadBackups()} disabled={busy} size="sm">
            <RefreshCw className={`w-4 h-4 ${operation === "checking" ? "animate-spin" : ""}`} />
            Verificar
          </Button>
        </div>
      </div>

      {/* Banner */}
      {(statusMessage || backupError || busy) && (
        <div className={`rounded-xl border px-5 py-3.5 flex items-center gap-3 ${backupError ? "bg-red-50 border-red-200 text-red-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
          {backupError ? <AlertTriangle className="w-5 h-5 shrink-0" /> : busy ? <RefreshCw className="w-5 h-5 animate-spin shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
          <div>
            <p className="text-sm font-medium">{backupError ? "Error en backups" : statusMessage}</p>
            {backupError && <p className="text-xs mt-0.5 opacity-80">{backupError}</p>}
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_380px] gap-8">
        {/* ───── COLUMN LEFT ───── */}
        <div className="space-y-8">

          {/* 🔗 VINCULACION */}
          <Card className="p-6">
            <SectionHeader icon={linkState === "linked" ? <Link2 size={18} /> : <Link2Off size={18} />} title="Vinculacion Cloud" subtitle="Conecta esta PC con tu cuenta de izTrack Cloud" />

            {linkState === "linked" && linkedInfo ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-800">Vinculada correctamente</p>
                      <p className="text-sm text-emerald-600 mt-0.5">Esta PC esta sincronizada con izTrack Cloud</p>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                  <InfoRow label="Estado" value={<StatusBadge label="Vinculada" color="green" />} icon={<CheckCircle size={14} className="text-emerald-500" />} />
                  {linkedInfo.branch_name && <InfoRow label="Sucursal" value={linkedInfo.branch_name} icon={<Monitor size={14} className="text-slate-400" />} />}
                </div>
              </div>
            ) : linkState === "waiting" ? (
              <div className="space-y-5">
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-5 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                    <KeyRound size={28} className="text-indigo-600" />
                  </div>
                  <p className="text-sm font-medium text-indigo-800 mb-2">Ingresa este codigo en el Portal Web</p>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <code className="text-2xl font-mono font-bold tracking-[0.25em] text-indigo-900 bg-white px-4 py-2.5 rounded-xl border border-indigo-200 select-all">
                      {linkToken}
                    </code>
                    <button
                      onClick={copyLinkCode}
                      className="w-10 h-10 rounded-xl bg-white border border-indigo-200 flex items-center justify-center text-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-indigo-500">Portal Web → Sucursales → Vincular sucursal</p>
                </div>

                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Timer size={16} />
                    <span className="text-sm">Esperando confirmacion...</span>
                  </div>
                  <span className={`text-sm font-mono font-bold ${linkCountdown < 60 ? "text-red-500" : "text-slate-700"}`}>
                    {formatCountdown(linkCountdown)}
                  </span>
                </div>

                <Button variant="secondary" onClick={() => {
                  setLinkState("idle");
                  setLinkToken("");
                  localStorage.removeItem("pending_link_token");
                  localStorage.removeItem("pending_link_started_at");
                  localStorage.removeItem("pending_link_expires_in");
                }} className="w-full">
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <Link2Off size={18} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">PC no vinculada</p>
                      <p className="text-xs text-slate-500 mt-1">Genera un codigo para conectar esta PC con tu cuenta de izTrack Cloud. El codigo vence en 10 minutos.</p>
                    </div>
                  </div>
                </div>

                {linkError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2 text-red-700 text-sm">
                    <AlertTriangle size={16} />
                    {linkError}
                  </div>
                )}

                <Button onClick={handleGenerateLink} loading={linkState === "generating"} className="w-full">
                  <Link2 size={16} />
                  Generar codigo de vinculacion
                </Button>
              </div>
            )}
          </Card>

          {/* ☁️ BACKUPS */}
          <Card className="p-6">
            <SectionHeader icon={<Cloud size={18} />} title="Backup en la nube" subtitle="Guarda y restaura tus datos de forma segura" />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Ultimo backup</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{latestBackup ? formatDateAR(latestBackup.created_at) : "Sin backups"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Tipo</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{latestBackup ? getBackupSourceLabel(getBackupRecordSource(latestBackup)) : "Sin datos"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Backup automatico</p>
                <p className="text-sm font-semibold text-emerald-700 mt-1">Cada {AUTO_BACKUP_INTERVAL_MINUTES} min</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Proximo</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{nextAutoBackupAt ? formatDateAR(nextAutoBackupAt) : "Esperando..."}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleBackup} disabled={busy} loading={operation === "saving"}>
                Guardar Backup
              </Button>
              <Button variant="secondary" onClick={() => requestRestore({ id: "latest", label: "el ultimo backup" })} disabled={busy || backups.length === 0}>
                <RotateCcw className="w-4 h-4" />
                Restaurar ultimo
              </Button>
            </div>
          </Card>

          {/* 📋 HISTORIAL */}
          <Card className="p-6">
            <SectionHeader icon={<History size={18} />} title="Historial de backups" subtitle="Ultimos 10 backups guardados en la nube" />

            {operation === "checking" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3 text-blue-700 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Verificando historial...
              </div>
            )}

            {backups.length === 0 && operation !== "checking" ? (
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-slate-400 transition-colors">
                <Cloud className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-700">No hay backups disponibles</p>
                <p className="text-xs text-slate-500 mt-1">Crea uno manualmente o espera al backup automatico.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map((backup) => {
                  const stats = getBackupStats(backup);
                  const source = getBackupRecordSource(backup);
                  return (
                    <div key={backup.id} className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{formatDateAR(backup.created_at)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${getBackupSourceColor(source)}`}>
                            {getBackupSourceIcon(source)}
                            {getBackupSourceLabel(source)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 inline-flex items-center gap-1">
                            <Cloud size={10} />Nube
                          </span>
                        </div>
                        {stats && (
                          <p className="text-xs text-slate-500 mt-1">
                            {stats.salesCount} ventas · {stats.expensesCount} gastos · {stats.size}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => requestRestore({ id: backup.id, label: `backup del ${formatDateAR(backup.created_at)}` })}
                        disabled={busy}
                        className="text-blue-600 text-sm font-medium hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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

        {/* ───── COLUMN RIGHT ───── */}
        <div className="space-y-6">

          {/* ESTADO AUTO-BACKUP */}
          <Card className="p-6">
            <SectionHeader icon={<Clock size={18} />} title="Estado automatico" />

            <div className="bg-slate-50 rounded-xl p-4 space-y-1">
              <InfoRow
                label="Ultimo automatico"
                value={lastAutoBackupAt ? formatDateAR(lastAutoBackupAt) : lastAutoBackupLocalAt ? `${formatDateAR(lastAutoBackupLocalAt)} (local)` : "Aun no registrado"}
              />
              <InfoRow
                label="Intervalo"
                value={`${AUTO_BACKUP_INTERVAL_MINUTES} minutos`}
              />
            </div>

            {lastAutoBackupError ? (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
                <p className="text-xs font-medium">Ultimo error</p>
                <p className="text-xs mt-1">{lastAutoBackupError}</p>
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm flex items-center gap-2">
                <CheckCircle size={16} />
                Backup automatico activo mientras la app esta abierta.
              </div>
            )}
          </Card>

          {/* ESCANER */}
          <Card className="p-6">
            <SectionHeader icon={<Barcode size={18} />} title="Escaner" subtitle="Lector de codigos de barras" />

            {scannerConfig && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Backend</span>
                  <span className="font-mono text-slate-700 font-medium">{scannerBackend || "ninguno"}</span>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Escaneos esta sesion</span>
                  <span className="font-semibold text-slate-700">{scannerHistory.length}</span>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" checked={scannerConfig.auto_open_sale} onChange={(e) => setScannerConfig({ ...scannerConfig, auto_open_sale: e.target.checked })} className="rounded border-slate-300" />
                    Abrir venta automaticamente
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" checked={scannerConfig.bring_to_front} onChange={(e) => setScannerConfig({ ...scannerConfig, bring_to_front: e.target.checked })} className="rounded border-slate-300" />
                    Traer ventana al frente
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" checked={scannerConfig.play_sound} onChange={(e) => setScannerConfig({ ...scannerConfig, play_sound: e.target.checked })} className="rounded border-slate-300" />
                    Reproducir sonido
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">Metodo pago default</label>
                      <select value={scannerConfig.default_payment_method} onChange={(e) => setScannerConfig({ ...scannerConfig, default_payment_method: e.target.value as PaymentMethod | "" })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white">
                        <option value="">Sin default</option>
                        <option value="cash">Efectivo</option>
                        <option value="debit">Debito</option>
                        <option value="credit">Credito</option>
                        <option value="transfer">Transferencia</option>
                        <option value="digital_wallet">Billetera digital</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Intervalo (ms)</label>
                      <input type="number" value={scannerConfig.max_char_interval} onChange={(e) => setScannerConfig({ ...scannerConfig, max_char_interval: Math.max(10, Math.min(2000, Number(e.target.value) || 50)) })}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" min={10} max={2000} />
                    </div>
                  </div>
                  <Button size="sm" onClick={async () => { setSavingScannerConfig(true); try { await window.api.saveScannerConfig(scannerConfig); } finally { setSavingScannerConfig(false); } }} loading={savingScannerConfig}>
                    Guardar configuracion
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* LICENCIA */}
          <Card className="p-6">
            <SectionHeader icon={<ShieldCheck size={18} />} title="Licencia" />
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Estado</span>
                <StatusBadge label="Activa" color="green" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Usuario</span>
                <span className="font-medium text-slate-700">Vinculado al sistema</span>
              </div>
            </div>
          </Card>

          {/* ACTUALIZACIONES */}
          <Card className="p-6">
            <SectionHeader icon={<DownloadCloud size={18} />} title="Actualizaciones" />

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Version instalada</span>
                <span className="font-semibold text-slate-800">izTrack {updateStatus?.currentVersion || "1.0.0"}</span>
              </div>

              <div className={`rounded-xl border px-3 py-2.5 text-xs ${
                updateStatus?.state === "available" || updateStatus?.state === "downloaded"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : updateStatus?.state === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>
                {updateStatus?.state === "available" && `Disponible v${updateStatus.availableVersion}`}
                {updateStatus?.state === "downloading" && `Descargando ${Math.round(updateStatus.percent)}%`}
                {updateStatus?.state === "downloaded" && "Lista para instalar"}
                {updateStatus?.state === "not-available" && (updateStatus.message || "No hay actualizaciones")}
                {updateStatus?.state === "checking" && "Verificando..."}
                {updateStatus?.state === "error" && (updateStatus.error || "Error al verificar")}
                {(!updateStatus || updateStatus.state === "idle") && "Sin verificacion reciente"}
                {updateStatus?.state === "unsupported" && updateStatus.message}
              </div>

              {updateStatus?.state === "downloading" && (
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300" style={{ width: `${Math.round(updateStatus.percent)}%` }} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {updateStatus?.state === "available" ? (
                <Button size="sm" onClick={handleDownloadUpdate} loading={updateBusy}>Descargar</Button>
              ) : updateStatus?.state === "downloading" ? (
                <Button size="sm" disabled loading>Descargando</Button>
              ) : updateStatus?.state === "downloaded" ? (
                <Button size="sm" onClick={handleInstallUpdate} loading={updateBusy}>Instalar</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={handleCheckUpdates} loading={updateBusy || updateStatus?.state === "checking"}>
                  <RefreshCw className="w-4 h-4" />
                  Verificar
                </Button>
              )}
            </div>
          </Card>

          {/* SISTEMA */}
          <Card className="p-6">
            <SectionHeader icon={<Settings size={18} />} title="Sistema" />
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Version</span>
                <span className="font-semibold text-slate-800">izTrack v{__APP_VERSION__}</span>
              </div>
            </div>
            <div className="mt-4">
              <Button size="sm" variant="secondary" onClick={handleExportDiagnostics} loading={diagnosticBusy}>
                <FileDown className="w-4 h-4" />
                Exportar diagnostico
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        title="Restaurar datos"
        message={`Esto reemplazara todos los datos actuales con ${restoreTarget?.label || "el backup seleccionado"}.`}
        onCancel={() => { setShowConfirm(false); setRestoreTarget(null); }}
        onConfirm={handleRestoreConfirm}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
