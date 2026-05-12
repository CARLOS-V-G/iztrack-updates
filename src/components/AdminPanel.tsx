import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Copy,
  Database,
  HardDrive,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type User = {
  id: string;
  email: string;
  license_key: string;
  active: boolean;
  device_id?: string | null;
};

type LicenseDB = {
  id: string;
  email: string;
  license_key: string;
  active: boolean;
  device_id: string | null;
};

type Notice = {
  type: "success" | "error" | "warning";
  message: string;
};

type FilterMode = "all" | "active" | "blocked" | "unlinked";

type WipeForm = {
  confirmEmail: string;
  confirmPhrase: string;
  deleteCloud: boolean;
  deleteLocal: boolean;
  requestRemoteLocal: boolean;
};

type EmailEditForm = {
  email: string;
  confirmEmail: string;
};

type Props = {
  onLogout: () => void;
};

interface AdminStatProps {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "blue" | "green" | "red" | "amber";
}

const filterLabels: Record<FilterMode, string> = {
  all: "Todas",
  active: "Activas",
  blocked: "Bloqueadas",
  unlinked: "Sin equipo",
};

const DELETE_CONFIRM_PHRASE = "ELIMINAR DATOS";

const emptyWipeForm: WipeForm = {
  confirmEmail: "",
  confirmPhrase: "",
  deleteCloud: true,
  deleteLocal: false,
  requestRemoteLocal: false,
};

const emptyEmailEditForm: EmailEditForm = {
  email: "",
  confirmEmail: "",
};

const noticeClasses = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

const statClasses = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
};

function AdminStat({ title, value, detail, icon, tone }: AdminStatProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 truncate">{value}</p>
          <p className="text-xs text-slate-400 mt-1 truncate">{detail}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${statClasses[tone]}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function getDeviceLabel(deviceId?: string | null) {
  if (!deviceId) return "Sin equipo vinculado";

  if (deviceId.length <= 14) return deviceId;

  return `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}`;
}

function AdminPanel({ onLogout }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [wipeTarget, setWipeTarget] = useState<User | null>(null);
  const [wipeForm, setWipeForm] = useState<WipeForm>(emptyWipeForm);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [emailEditTarget, setEmailEditTarget] = useState<User | null>(null);
  const [emailEditForm, setEmailEditForm] = useState<EmailEditForm>(emptyEmailEditForm);
  const [emailEditLoading, setEmailEditLoading] = useState(false);

  const localUserId = localStorage.getItem("userId") || "";

  const loadUsers = useCallback(async () => {
    setLoading(true);

    try {
      const data = await window.api.getLicenses();
      const mapped: User[] = (data as LicenseDB[]).map((item) => ({
        id: item.id,
        email: item.email,
        license_key: item.license_key,
        active: item.active,
        device_id: item.device_id,
      }));

      setUsers(mapped);
      setNotice(null);
    } catch (error) {
      console.error("Error cargando licencias:", error);
      setNotice({
        type: "error",
        message: "No se pudo cargar el panel de licencias.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.active);
    const blocked = users.filter((user) => !user.active);
    const linked = users.filter((user) => Boolean(user.device_id));
    const unlinked = users.filter((user) => !user.device_id);

    return {
      total: users.length,
      active: active.length,
      blocked: blocked.length,
      linked: linked.length,
      unlinked: unlinked.length,
    };
  }, [users]);

  const recommendation = useMemo(() => {
    if (stats.total === 0) {
      return {
        tone: "blue" as const,
        title: "Crear primera licencia",
        body: "Todavia no hay clientes cargados. Genera una licencia para empezar a activar equipos.",
      };
    }

    if (stats.blocked > 0) {
      return {
        tone: "red" as const,
        title: "Revisar licencias bloqueadas",
        body: "Hay licencias bloqueadas. Verifica si fueron baja real o si hay que reactivarlas.",
      };
    }

    if (stats.unlinked > 0) {
      return {
        tone: "amber" as const,
        title: "Licencias sin equipo",
        body: "Hay licencias activas sin dispositivo vinculado. Conviene confirmar si ya fueron entregadas.",
      };
    }

    return {
      tone: "green" as const,
      title: "Panel saludable",
      body: "Todas las licencias estan activas y vinculadas a un equipo.",
    };
  }, [stats.blocked, stats.total, stats.unlinked]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        user.license_key.toLowerCase().includes(normalizedSearch) ||
        (user.device_id || "").toLowerCase().includes(normalizedSearch);

      const matchesFilter =
        filter === "all" ||
        (filter === "active" && user.active) ||
        (filter === "blocked" && !user.active) ||
        (filter === "unlinked" && !user.device_id);

      return matchesSearch && matchesFilter;
    });
  }, [filter, search, users]);

  const canWipeCurrentLocal = Boolean(wipeTarget && wipeTarget.id === localUserId);

  const canConfirmWipe = Boolean(
    wipeTarget &&
      wipeForm.confirmEmail.trim().toLowerCase() === wipeTarget.email.toLowerCase() &&
      wipeForm.confirmPhrase.trim().toUpperCase() === DELETE_CONFIRM_PHRASE &&
      (wipeForm.deleteCloud || wipeForm.deleteLocal || wipeForm.requestRemoteLocal) &&
      (!wipeForm.deleteLocal || canWipeCurrentLocal)
  );

  const cleanEditedEmail = emailEditForm.email.trim().toLowerCase();
  const cleanEditedConfirmation = emailEditForm.confirmEmail.trim().toLowerCase();
  const canConfirmEmailEdit = Boolean(
    emailEditTarget &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEditedEmail) &&
      cleanEditedEmail !== emailEditTarget.email.toLowerCase() &&
      cleanEditedConfirmation === cleanEditedEmail
  );

  function openEmailEditModal(user: User) {
    setEmailEditTarget(user);
    setEmailEditForm({
      email: "",
      confirmEmail: "",
    });
    setNotice(null);
  }

  function closeEmailEditModal() {
    setEmailEditTarget(null);
    setEmailEditForm(emptyEmailEditForm);
  }

  function updateEmailEditForm<K extends keyof EmailEditForm>(key: K, value: EmailEditForm[K]) {
    setEmailEditForm((current) => ({ ...current, [key]: value }));
  }

  function openWipeModal(user: User) {
    const isLocalUser = user.id === localUserId;

    setWipeTarget(user);
    setWipeForm({
      ...emptyWipeForm,
      deleteLocal: isLocalUser,
      requestRemoteLocal: !isLocalUser,
    });
    setNotice(null);
  }

  function updateWipeForm<K extends keyof WipeForm>(key: K, value: WipeForm[K]) {
    setWipeForm((current) => ({ ...current, [key]: value }));
  }

  async function generate() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setNotice({
        type: "warning",
        message: "Ingresa un email para generar la licencia.",
      });
      return;
    }

    if (!cleanEmail.includes("@")) {
      setNotice({
        type: "warning",
        message: "El email no parece valido. Revisa antes de generar.",
      });
      return;
    }

    setSaving(true);

    try {
      const key = await window.api.createLicense(cleanEmail);

      if (!key) {
        setNotice({
          type: "error",
          message: "No se pudo generar la licencia.",
        });
        return;
      }

      setEmail("");
      setNotice({
        type: "success",
        message: `Licencia generada para ${cleanEmail}.`,
      });
      await loadUsers();
    } catch (error) {
      console.error("Error generando licencia:", error);
      setNotice({
        type: "error",
        message: "No se pudo generar la licencia.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, currentActive: boolean) {
    setActionId(id);

    try {
      const newStatus = !currentActive;
      await window.api.toggleLicense(id, newStatus);
      setUsers((current) =>
        current.map((user) =>
          user.id === id
            ? {
                ...user,
                active: newStatus,
              }
            : user
        )
      );
      setNotice({
        type: "success",
        message: newStatus ? "Licencia activada." : "Licencia bloqueada.",
      });
    } catch (error) {
      console.error("Error cambiando licencia:", error);
      setNotice({
        type: "error",
        message: "No se pudo cambiar el estado de la licencia.",
      });
    } finally {
      setActionId(null);
    }
  }

  async function confirmDelete() {
    if (!userToDelete) return;

    setActionId(userToDelete.id);

    try {
      const ok = await window.api.deleteLicense(userToDelete.id);

      if (!ok) {
        setNotice({
          type: "error",
          message: "No se pudo eliminar la licencia.",
        });
        return;
      }

      setUsers((current) => current.filter((user) => user.id !== userToDelete.id));
      setNotice({
        type: "success",
        message: `Licencia eliminada para ${userToDelete.email}.`,
      });
      setUserToDelete(null);
    } catch (error) {
      console.error("Error eliminando licencia:", error);
      setNotice({
        type: "error",
        message: "No se pudo eliminar la licencia.",
      });
    } finally {
      setActionId(null);
    }
  }

  async function confirmDataWipe() {
    if (!wipeTarget || !canConfirmWipe) return;

    setWipeLoading(true);

    try {
      const result = await window.api.deleteUserData({
        userId: wipeTarget.id,
        confirmEmail: wipeForm.confirmEmail,
        confirmPhrase: wipeForm.confirmPhrase,
        deleteCloud: wipeForm.deleteCloud,
        deleteLocal: wipeForm.deleteLocal,
        requestRemoteLocal: wipeForm.requestRemoteLocal,
      });

      if (!result.ok) {
        setNotice({
          type: "error",
          message: result.message,
        });
        return;
      }

      const cloudText = result.cloudDeleted
        ? `${result.cloudDeleted.salesDeleted} ventas, ${result.cloudDeleted.expensesDeleted} gastos y ${result.cloudDeleted.backupsDeleted} backups borrados de Supabase.`
        : "";
      const localText = result.localDeleted
        ? `${result.localDeleted.salesDeleted} ventas y ${result.localDeleted.expensesDeleted} gastos borrados del local de este equipo.`
        : "";
      const remoteText = result.remoteWipeRequestedAt
        ? "Solicitud de borrado local creada para el equipo del usuario."
        : "";

      setNotice({
        type: "success",
        message: [cloudText, localText, remoteText].filter(Boolean).join(" "),
      });
      setWipeTarget(null);
      setWipeForm(emptyWipeForm);
    } catch (error) {
      console.error("Error borrando datos:", error);
      setNotice({
        type: "error",
        message: "No se pudo borrar la base de datos del usuario.",
      });
    } finally {
      setWipeLoading(false);
    }
  }

  async function confirmEmailEdit() {
    if (!emailEditTarget || !canConfirmEmailEdit) return;

    setEmailEditLoading(true);
    setActionId(emailEditTarget.id);

    try {
      const result = await window.api.updateLicenseEmail(emailEditTarget.id, cleanEditedEmail);

      if (!result.ok || !result.license) {
        setNotice({
          type: "error",
          message: result.message,
        });
        return;
      }

      const updatedUser: User = {
        id: result.license.id,
        email: result.license.email,
        license_key: result.license.license_key,
        active: result.license.active,
        device_id: result.license.device_id,
      };

      setUsers((current) =>
        current.map((user) => (user.id === updatedUser.id ? updatedUser : user))
      );

      if (updatedUser.id === localUserId) {
        localStorage.setItem("email", updatedUser.email);
        await window.api.saveLicense({
          email: updatedUser.email,
          key: updatedUser.license_key,
        });
      }

      setNotice({
        type: "success",
        message: result.message,
      });
      closeEmailEditModal();
    } catch (error) {
      console.error("Error actualizando email:", error);
      setNotice({
        type: "error",
        message: "No se pudo actualizar el email de la licencia.",
      });
    } finally {
      setActionId(null);
      setEmailEditLoading(false);
    }
  }

  async function copyKey(user: User) {
    await navigator.clipboard.writeText(user.license_key);
    setCopiedId(user.id);
    setNotice({
      type: "success",
      message: "Licencia copiada al portapapeles.",
    });
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-72 bg-slate-950 text-white p-6 flex flex-col justify-between">
        <div>
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-5">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">izTrack Admin</h1>
          <p className="text-sm text-slate-400 mt-2">Gestion de licencias</p>

          <div className="mt-8 space-y-3">
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <p className="text-xs text-slate-400">Licencias activas</p>
              <p className="text-2xl font-bold text-white">{stats.active}</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <p className="text-xs text-slate-400">Bloqueadas</p>
              <p className="text-2xl font-bold text-red-300">{stats.blocked}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs text-slate-400">Atajo admin</p>
            <p className="text-sm font-semibold text-white mt-1">Ctrl + Shift + A</p>
          </div>
          <Button variant="danger" className="w-full" onClick={onLogout}>
            <LogOut className="w-4 h-4" />
            Cerrar sesion
          </Button>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-y-auto">
        <div className="p-8 space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Panel administrativo</h2>
              <p className="text-sm text-slate-500 mt-1">
                Control de clientes, claves, dispositivos y estados de licencia.
              </p>
            </div>

            <Button variant="secondary" onClick={loadUsers} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>

          {notice && (
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${noticeClasses[notice.type]}`}>
              {notice.type === "success" ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <p className="text-sm font-medium">{notice.message}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="ml-auto text-current opacity-60 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <AdminStat
              title="Total licencias"
              value={String(stats.total)}
              detail="Clientes creados"
              icon={<KeyRound className="w-5 h-5" />}
              tone="blue"
            />
            <AdminStat
              title="Activas"
              value={String(stats.active)}
              detail="Pueden usar el sistema"
              icon={<CheckCircle className="w-5 h-5" />}
              tone="green"
            />
            <AdminStat
              title="Bloqueadas"
              value={String(stats.blocked)}
              detail="Acceso detenido"
              icon={<Ban className="w-5 h-5" />}
              tone="red"
            />
            <AdminStat
              title="Sin equipo"
              value={String(stats.unlinked)}
              detail={`${stats.linked} vinculadas`}
              icon={<Monitor className="w-5 h-5" />}
              tone={stats.unlinked > 0 ? "amber" : "green"}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
            <div className="space-y-6">
              <Card className="p-5">
                <form
                  className="flex flex-col gap-3 lg:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    generate();
                  }}
                >
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Email del cliente
                    </label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-xl outline-none text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="cliente@email.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  <Button type="submit" className="lg:self-end" loading={saving}>
                    <Plus className="w-4 h-4" />
                    Generar licencia
                  </Button>
                </form>
              </Card>

              <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        Usuarios / licencias
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {filteredUsers.length} resultados visibles
                      </p>
                    </div>

                    <div className="relative min-w-[260px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        placeholder="Buscar email, clave o equipo..."
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {(Object.keys(filterLabels) as FilterMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFilter(mode)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          filter === mode
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {filterLabels[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-[56vh] overflow-y-auto scroll-pro">
                  {loading ? (
                    <div className="flex items-center justify-center py-14 text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      Cargando licencias...
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-14 px-6 text-center text-slate-400">
                      <KeyRound className="w-10 h-10 mx-auto mb-3 opacity-25" />
                      <p className="text-sm">No hay licencias para este filtro.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {filteredUsers.map((user) => (
                        <div key={user.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 truncate">{user.email}</p>
                                <Badge label={user.active ? "Activa" : "Bloqueada"} color={user.active ? "green" : "red"} />
                                {!user.device_id && <Badge label="Sin equipo" color="amber" />}
                              </div>

                              <div className="flex items-center gap-2 mt-2 min-w-0">
                                <code className="text-xs text-slate-500 bg-slate-100 rounded-lg px-2 py-1 truncate">
                                  {user.license_key}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => copyKey(user)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  title="Copiar licencia"
                                >
                                  {copiedId === user.id ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>

                              <p className="text-xs text-slate-400 mt-2">
                                Equipo: {getDeviceLabel(user.device_id)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={actionId === user.id && emailEditLoading}
                                onClick={() => openEmailEditModal(user)}
                              >
                                <Pencil className="w-4 h-4" />
                                Email
                              </Button>

                              <Button
                                variant={user.active ? "secondary" : "success"}
                                size="sm"
                                loading={actionId === user.id}
                                onClick={() => toggle(user.id, user.active)}
                              >
                                {user.active ? (
                                  <Ban className="w-4 h-4" />
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                                {user.active ? "Bloquear" : "Activar"}
                              </Button>

                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => openWipeModal(user)}
                              >
                                <Database className="w-4 h-4" />
                                Datos
                              </Button>

                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setUserToDelete(user)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden xl:sticky xl:top-6">
              <div
                className={`p-5 border-b ${
                  recommendation.tone === "red"
                    ? "bg-red-50 border-red-100"
                    : recommendation.tone === "amber"
                      ? "bg-amber-50 border-amber-100"
                      : recommendation.tone === "green"
                        ? "bg-green-50 border-green-100"
                        : "bg-blue-50 border-blue-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      recommendation.tone === "red"
                        ? "bg-red-600 text-white"
                        : recommendation.tone === "amber"
                          ? "bg-amber-500 text-white"
                          : recommendation.tone === "green"
                            ? "bg-green-600 text-white"
                            : "bg-blue-600 text-white"
                    }`}
                  >
                    {recommendation.tone === "green" ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Recomendado
                    </p>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {recommendation.title}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">{recommendation.body}</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Tasa activa</p>
                      <p className="text-lg font-bold text-slate-900">
                        {stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%
                      </p>
                    </div>
                    <Badge label={`${stats.active}/${stats.total}`} color="green" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Vinculacion</p>
                      <p className="text-lg font-bold text-slate-900">
                        {stats.total ? Math.round((stats.linked / stats.total) * 100) : 0}%
                      </p>
                    </div>
                    <Badge label={`${stats.linked} equipos`} color={stats.unlinked ? "amber" : "green"} />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-500">Acciones rapidas</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setFilter("blocked")}>
                      Bloqueadas
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setFilter("unlinked")}>
                      Sin equipo
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold text-blue-900">Nota de seguridad</p>
                  <p className="text-xs text-blue-800 mt-1">
                    Los cambios de licencia se ejecutan desde el proceso principal de Electron. Evita compartir claves por canales publicos.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {wipeTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  Borrar base de datos del usuario
                </h3>
                <p className="text-xs text-slate-500 mt-1">{wipeTarget.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setWipeTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900">
                    Esta accion borra ventas, gastos y backups. No elimina la licencia.
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    El borrado local remoto se ejecuta cuando el usuario abre la app o cuando el chequeo automatico detecta la solicitud.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="rounded-xl border border-slate-200 px-4 py-3 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={wipeForm.deleteCloud}
                      onChange={(event) => updateWipeForm("deleteCloud", event.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-700" />
                        Supabase
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Borra ventas, gastos y backups de la nube.
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`rounded-xl border px-4 py-3 ${
                    canWipeCurrentLocal
                      ? "border-slate-200 cursor-pointer"
                      : "border-slate-200 bg-slate-50 cursor-not-allowed opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!canWipeCurrentLocal}
                      checked={wipeForm.deleteLocal}
                      onChange={(event) => updateWipeForm("deleteLocal", event.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-slate-700" />
                        Local actual
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Solo disponible si esta licencia es la de este equipo.
                      </p>
                    </div>
                  </div>
                </label>

                <label className="rounded-xl border border-slate-200 px-4 py-3 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={wipeForm.requestRemoteLocal}
                      onChange={(event) => updateWipeForm("requestRemoteLocal", event.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-amber-700" />
                        Local usuario
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Crea solicitud para borrar el local del equipo del usuario.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Escribe el email exacto
                  </label>
                  <input
                    value={wipeForm.confirmEmail}
                    onChange={(event) => updateWipeForm("confirmEmail", event.target.value)}
                    placeholder={wipeTarget.email}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Escribe {DELETE_CONFIRM_PHRASE}
                  </label>
                  <input
                    value={wipeForm.confirmPhrase}
                    onChange={(event) => updateWipeForm("confirmPhrase", event.target.value)}
                    placeholder={DELETE_CONFIRM_PHRASE}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {!canWipeCurrentLocal && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-800">
                    La base local de otro equipo no se puede borrar directamente desde este panel. Se crea una solicitud remota y ese equipo la ejecuta al abrir izTrack.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-slate-200">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setWipeTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={!canConfirmWipe}
                loading={wipeLoading}
                onClick={confirmDataWipe}
              >
                Borrar datos
              </Button>
            </div>
          </Card>
        </div>
      )}

      {emailEditTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  Cambiar email de licencia
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  La licencia y los datos del cliente se mantienen.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEmailEditModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-xs font-semibold text-blue-900">No se genera una licencia nueva</p>
                <p className="text-xs text-blue-800 mt-1">
                  Solo cambia el email de contacto. Se conserva el mismo ID, la misma clave y los backups/ventas del cliente.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Email actual
                </label>
                <input
                  value={emailEditTarget.email}
                  disabled
                  className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Nuevo email
                </label>
                <input
                  type="email"
                  value={emailEditForm.email}
                  onChange={(event) => updateEmailEditForm("email", event.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Repite el nuevo email
                </label>
                <input
                  type="email"
                  value={emailEditForm.confirmEmail}
                  onChange={(event) => updateEmailEditForm("confirmEmail", event.target.value)}
                  placeholder={cleanEditedEmail || "cliente@email.com"}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">Licencia conservada</p>
                <code className="mt-1 block text-xs text-slate-700 bg-slate-100 rounded-lg px-2 py-1 truncate">
                  {emailEditTarget.license_key}
                </code>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-slate-200">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={closeEmailEditModal}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!canConfirmEmailEdit}
                loading={emailEditLoading}
                onClick={confirmEmailEdit}
              >
                Guardar email
              </Button>
            </div>
          </Card>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">Eliminar licencia</h3>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900">
                    Esta accion no se puede deshacer.
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    Se eliminara la licencia de {userToDelete.email}.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-slate-200">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setUserToDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={actionId === userToDelete.id}
                onClick={confirmDelete}
              >
                Eliminar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
