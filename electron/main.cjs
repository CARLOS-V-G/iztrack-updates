const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const zlib = require("zlib");

let autoUpdater = null;
let autoUpdaterLoadError = null;

try {
    ({ autoUpdater } = require("electron-updater"));
} catch (err) {
    autoUpdaterLoadError = err;
}

const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const {
    normalizeBackupData,
    normalizeBoolean,
    normalizeDataWipeRunRequest,
    normalizeDeleteUserDataRequest,
    normalizeEmail,
    normalizeExpenseForCreate,
    normalizeExpenseForUpdate,
    normalizeExpenseStatusToggle,
    normalizeId,
    normalizeLicenseInput,
    normalizeLicenseRecordId,
    normalizePassword,
    normalizeSaleForCreate,
    normalizeSaleForUpdate,
    normalizeSaleVoidToggle,
} = require("./ipcValidation.cjs");

// 🔥 SUPABASE
const supabase = createClient(
    "https://fdnoudylvoyamsbwygdt.supabase.co",
    "sb_publishable_Wz4Y-edWnLTubNlLJUw8jg_Nf5zv4kd"
);

// 🔥 LOWDB
const { db, initDB } = require("./db/db.cjs");

// 🔐 HASH ADMIN
const ADMIN_HASH = "$2b$10$emWYM2L4SgilfgvHCASHeOgp/FwULV3brE8IdSz2w7Hw0P/VCgmR6";

// 📄 LICENCIA LOCAL
const licensePath = path.join(app.getPath("userData"), "license.json");

let mainWindow;

// =========================
// 🚫 EVITAR DOBLE INSTANCIA
// =========================
const gotTheLock = app.requestSingleInstanceLock();

const { v4: uuidv4 } = require("uuid");
const BACKUP_TIMEOUT_MS = 30000;
const BACKUP_SOURCES = new Set(["manual", "automatic", "migration"]);
const WIPE_REASON = "admin_requested";
const UPDATE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STATUS_CHANNEL = "updater:status";

const updateRuntime = {
    state: autoUpdater ? "idle" : "unsupported",
    availableVersion: null,
    downloadedVersion: null,
    updateDetectedAt: null,
    dismissedAt: null,
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    message: autoUpdaterLoadError ? "electron-updater no esta instalado." : "",
    error: autoUpdaterLoadError ? autoUpdaterLoadError.message : "",
};

let updaterConfigured = false;

if (!gotTheLock) {
    app.quit();
} else {
    app.whenReady().then(async () => {
        await initDB();
        createWindow();
        setupAutoUpdater();
    });

    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// =========================
// 🪟 VENTANA
// =========================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        icon: path.join(__dirname, "../dist/log0.ico"),
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

// =========================
// ACTUALIZADOR
// =========================
function getUpdateStatePath() {
    return path.join(app.getPath("userData"), "update-state.json");
}

function readUpdateState() {
    try {
        const filePath = getUpdateStatePath();
        if (!fs.existsSync(filePath)) return {};

        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return {};
    }
}

function writeUpdateState(state) {
    const filePath = getUpdateStatePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function clearUpdateState() {
    try {
        const filePath = getUpdateStatePath();
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
        // No bloquear el uso del programa si no se puede limpiar metadata local.
    }
}

function getUpdateInfoVersion(info) {
    return String(info?.version || updateRuntime.availableVersion || "");
}

function persistUpdateAvailable(info) {
    const version = getUpdateInfoVersion(info);
    const saved = readUpdateState();
    const detectedAt =
        saved.availableVersion === version && saved.updateDetectedAt
            ? saved.updateDetectedAt
            : new Date().toISOString();

    updateRuntime.availableVersion = version;
    updateRuntime.updateDetectedAt = detectedAt;
    updateRuntime.dismissedAt =
        saved.availableVersion === version ? saved.dismissedAt || null : null;

    writeUpdateState({
        availableVersion: version,
        updateDetectedAt: detectedAt,
        dismissedAt: updateRuntime.dismissedAt,
    });
}

function persistUpdateDismissed() {
    if (!updateRuntime.availableVersion || !updateRuntime.updateDetectedAt) return;

    updateRuntime.dismissedAt = new Date().toISOString();
    writeUpdateState({
        availableVersion: updateRuntime.availableVersion,
        updateDetectedAt: updateRuntime.updateDetectedAt,
        dismissedAt: updateRuntime.dismissedAt,
    });
}

function getUpdateErrorMessage(error) {
    return error?.message || String(error || "");
}

function isNoPublishedUpdateError(error) {
    return /No published versions on GitHub|No releases found|No release found/i.test(
        getUpdateErrorMessage(error)
    );
}

function markNoUpdateAvailable(message = "No hay actualizaciones disponibles.") {
    clearUpdateState();
    updateRuntime.state = "not-available";
    updateRuntime.availableVersion = null;
    updateRuntime.downloadedVersion = null;
    updateRuntime.updateDetectedAt = null;
    updateRuntime.dismissedAt = null;
    updateRuntime.percent = 0;
    updateRuntime.bytesPerSecond = 0;
    updateRuntime.transferred = 0;
    updateRuntime.total = 0;
    updateRuntime.message = message;
    updateRuntime.error = "";
}

function getUpdateStatus() {
    const supported = Boolean(autoUpdater) && app.isPackaged;
    const updateDetectedAt = updateRuntime.updateDetectedAt;
    const mandatoryAt = updateDetectedAt
        ? new Date(new Date(updateDetectedAt).getTime() + UPDATE_GRACE_PERIOD_MS).toISOString()
        : null;
    const isMandatory = mandatoryAt ? Date.now() >= new Date(mandatoryAt).getTime() : false;

    return {
        supported,
        installedDependency: Boolean(autoUpdater),
        packaged: app.isPackaged,
        state: supported ? updateRuntime.state : "unsupported",
        currentVersion: app.getVersion(),
        availableVersion: updateRuntime.availableVersion,
        downloadedVersion: updateRuntime.downloadedVersion,
        updateDetectedAt,
        mandatoryAt,
        isMandatory,
        percent: Math.max(0, Math.min(100, Number(updateRuntime.percent || 0))),
        bytesPerSecond: Number(updateRuntime.bytesPerSecond || 0),
        transferred: Number(updateRuntime.transferred || 0),
        total: Number(updateRuntime.total || 0),
        dismissedAt: updateRuntime.dismissedAt,
        message: supported
            ? updateRuntime.message
            : autoUpdaterLoadError
                ? "Instala electron-updater para activar actualizaciones."
                : "Las actualizaciones automaticas se activan en la app instalada.",
        error: updateRuntime.error,
    };
}

function sendUpdateStatus() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(UPDATE_STATUS_CHANNEL, getUpdateStatus());
}

function setupAutoUpdater() {
    if (updaterConfigured) return;
    updaterConfigured = true;

    if (!autoUpdater) {
        updateRuntime.state = "unsupported";
        sendUpdateStatus();
        return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
        updateRuntime.state = "checking";
        updateRuntime.message = "Verificando actualizaciones...";
        updateRuntime.error = "";
        sendUpdateStatus();
    });

    autoUpdater.on("update-available", (info) => {
        persistUpdateAvailable(info);
        updateRuntime.state = "available";
        updateRuntime.percent = 0;
        updateRuntime.message = "Hay una nueva version disponible.";
        updateRuntime.error = "";
        sendUpdateStatus();
    });

    autoUpdater.on("update-not-available", () => {
        markNoUpdateAvailable("Ya tienes la ultima version.");
        sendUpdateStatus();
    });

    autoUpdater.on("download-progress", (progress) => {
        updateRuntime.state = "downloading";
        updateRuntime.percent = Number(progress?.percent || 0);
        updateRuntime.bytesPerSecond = Number(progress?.bytesPerSecond || 0);
        updateRuntime.transferred = Number(progress?.transferred || 0);
        updateRuntime.total = Number(progress?.total || 0);
        updateRuntime.message = "Descargando actualizacion...";
        updateRuntime.error = "";
        sendUpdateStatus();
    });

    autoUpdater.on("update-downloaded", (info) => {
        updateRuntime.state = "downloaded";
        updateRuntime.downloadedVersion = getUpdateInfoVersion(info);
        updateRuntime.percent = 100;
        updateRuntime.message = "Actualizacion lista para instalar.";
        updateRuntime.error = "";
        sendUpdateStatus();
    });

    autoUpdater.on("error", (error) => {
        if (isNoPublishedUpdateError(error)) {
            markNoUpdateAvailable();
            sendUpdateStatus();
            return;
        }

        updateRuntime.state = "error";
        updateRuntime.message = "No se pudo completar la actualizacion.";
        updateRuntime.error = getUpdateErrorMessage(error);
        sendUpdateStatus();
    });

    const saved = readUpdateState();
    if (saved.availableVersion && saved.updateDetectedAt) {
        updateRuntime.availableVersion = saved.availableVersion;
        updateRuntime.updateDetectedAt = saved.updateDetectedAt;
        updateRuntime.dismissedAt = saved.dismissedAt || null;
    }

    if (app.isPackaged) {
        setTimeout(() => checkForAppUpdates(), 8000);
        setInterval(() => checkForAppUpdates(), UPDATE_CHECK_INTERVAL_MS);
    }
}

async function checkForAppUpdates() {
    setupAutoUpdater();

    if (!autoUpdater || !app.isPackaged) {
        updateRuntime.state = "unsupported";
        sendUpdateStatus();
        return getUpdateStatus();
    }

    try {
        updateRuntime.state = "checking";
        updateRuntime.message = "Verificando actualizaciones...";
        updateRuntime.error = "";
        sendUpdateStatus();

        await autoUpdater.checkForUpdates();
        return getUpdateStatus();
    } catch (err) {
        if (isNoPublishedUpdateError(err)) {
            markNoUpdateAvailable();
            sendUpdateStatus();
            return getUpdateStatus();
        }

        updateRuntime.state = "error";
        updateRuntime.message = "No se pudo verificar si hay actualizaciones.";
        updateRuntime.error = getUpdateErrorMessage(err);
        sendUpdateStatus();
        return getUpdateStatus();
    }
}

async function downloadAppUpdate() {
    setupAutoUpdater();

    if (!autoUpdater || !app.isPackaged) {
        updateRuntime.state = "unsupported";
        sendUpdateStatus();
        return getUpdateStatus();
    }

    try {
        updateRuntime.state = "downloading";
        updateRuntime.message = "Descargando actualizacion...";
        updateRuntime.error = "";
        sendUpdateStatus();

        await autoUpdater.downloadUpdate();
        return getUpdateStatus();
    } catch (err) {
        updateRuntime.state = "error";
        updateRuntime.message = "No se pudo descargar la actualizacion.";
        updateRuntime.error = getUpdateErrorMessage(err);
        sendUpdateStatus();
        return getUpdateStatus();
    }
}

async function snapshotBeforeUpdateInstall() {
    await db.read();

    const salesCount = db.data?.sales?.length || 0;
    const expensesCount = db.data?.expenses?.length || 0;

    if (salesCount === 0 && expensesCount === 0) return null;

    const payload = createBackupPayload("manual");
    return writeLocalBackup(payload.compressed);
}

async function installAppUpdate() {
    setupAutoUpdater();

    if (!autoUpdater || !app.isPackaged || updateRuntime.state !== "downloaded") {
        return getUpdateStatus();
    }

    try {
        const localBackupPath = await snapshotBeforeUpdateInstall();
        if (localBackupPath) {
            updateRuntime.message = "Backup local creado antes de instalar la actualizacion.";
            sendUpdateStatus();
        }
    } catch (err) {
        updateRuntime.state = "error";
        updateRuntime.message = "No se instalo la actualizacion para proteger tus datos.";
        updateRuntime.error =
            err?.message || "No se pudo crear un backup local antes de actualizar.";
        sendUpdateStatus();
        return getUpdateStatus();
    }

    setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
    });

    return {
        ...getUpdateStatus(),
        message: "Reiniciando para instalar la actualizacion.",
    };
}

// =========================
// 🔧 UTIL
// =========================
function getDeviceId() {
    return os.hostname();
}

function normalizeBackupSource(source) {
    return BACKUP_SOURCES.has(source) ? source : "manual";
}

function compactSaleForBackup(sale) {
    return {
        id: sale.id,
        sale_date: sale.sale_date || sale.date,
        amount: Number(sale.amount || 0),
        payment_method: sale.payment_method || sale.method || "cash",
        notes: sale.notes || "",
        voided: sale.voided ?? false,
        updated_at: sale.updated_at,
    };
}

function compactExpenseForBackup(expense) {
    return {
        id: expense.id,
        expense_date: expense.expense_date || expense.date,
        concept: expense.concept || "Sin concepto",
        category: expense.category || "",
        amount: Number(expense.amount || 0),
        payment_method: expense.payment_method || expense.method || "cash",
        status: expense.status || "paid",
        notes: expense.notes || "",
        updated_at: expense.updated_at,
    };
}

function createBackupPayload(source) {
    const sales = (db.data.sales || []).map(compactSaleForBackup);
    const expenses = (db.data.expenses || []).map(compactExpenseForBackup);
    const jsonPayload = JSON.stringify({
        sales,
        expenses,
        meta: {
            source,
            created_at: new Date().toISOString(),
            sales_count: sales.length,
            expenses_count: expenses.length,
            app_version: app.getVersion(),
            format: "json",
        },
    });
    const compressed = zlib.gzipSync(Buffer.from(jsonPayload, "utf8"));

    return {
        data: {
            format: "gzip-base64",
            payload: compressed.toString("base64"),
            meta: {
                source,
                created_at: new Date().toISOString(),
                sales_count: sales.length,
                expenses_count: expenses.length,
                app_version: app.getVersion(),
                format: "gzip-base64",
                uncompressed_bytes: Buffer.byteLength(jsonPayload, "utf8"),
                compressed_bytes: compressed.byteLength,
            },
        },
        compressed,
        stats: {
            sales_count: sales.length,
            expenses_count: expenses.length,
            uncompressed_bytes: Buffer.byteLength(jsonPayload, "utf8"),
            compressed_bytes: compressed.byteLength,
        },
    };
}

function decodeStoredBackupData(data) {
    if (!data || typeof data !== "object") {
        throw new Error("El backup no contiene datos restaurables.");
    }

    if (data.format === "gzip-base64") {
        if (!data.payload || typeof data.payload !== "string") {
            throw new Error("El backup comprimido no contiene payload valido.");
        }

        const json = zlib
            .gunzipSync(Buffer.from(data.payload, "base64"))
            .toString("utf8");

        return JSON.parse(json);
    }

    return data;
}

function writeLocalBackup(compressed) {
    const backupDir = path.join(app.getPath("userData"), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `iztrack-backup-${stamp}.json.gz`);

    fs.writeFileSync(backupPath, compressed);

    return backupPath;
}

async function restoreCloudBackup(userId, backupId) {
    const safeUserId = normalizeId(userId, "user_id");
    const safeBackupId =
        backupId && backupId !== "latest" ? normalizeId(backupId, "backup_id") : null;

    let query = supabase
        .from("backups")
        .select("id, created_at, data")
        .eq("user_id", safeUserId);

    if (safeBackupId) {
        query = query.eq("id", safeBackupId).limit(1);
    } else {
        query = query.order("created_at", { ascending: false }).limit(1);
    }

    const { data: backup, error } = await withTimeout(
        query.single(),
        BACKUP_TIMEOUT_MS
    );

    if (error || !backup) {
        throw new Error(error?.message || "Backup no encontrado.");
    }

    const decodedBackup = decodeStoredBackupData(backup.data);
    const { sales, expenses } = normalizeBackupData(decodedBackup);
    const restoredAt = new Date().toISOString();

    await db.read();

    db.data.sales = sales.map((sale) => ({
        ...sale,
        id: sale.id || uuidv4(),
        updated_at: sale.updated_at || restoredAt,
    }));
    db.data.expenses = expenses.map((expense) => ({
        ...expense,
        id: expense.id || uuidv4(),
        updated_at: expense.updated_at || restoredAt,
    }));

    await db.write();

    return {
        id: backup.id,
        created_at: backup.created_at,
        sales_count: db.data.sales.length,
        expenses_count: db.data.expenses.length,
    };
}

function withTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error("La nube tardo demasiado en responder. Se guardo una copia local."));
            }, timeoutMs);
        }),
    ]);
}

async function getLicenseById(userId) {
    const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .eq("id", userId)
        .single();

    if (error || !data) {
        throw new Error(error?.message || "Licencia no encontrada.");
    }

    return data;
}

async function getCurrentLocalUserId() {
    if (!fs.existsSync(licensePath)) return null;

    const license = normalizeLicenseInput(
        JSON.parse(fs.readFileSync(licensePath, "utf8"))
    );

    const { data, error } = await supabase
        .from("licenses")
        .select("id")
        .eq("license_key", license.key)
        .single();

    if (error || !data) return null;

    return data.id;
}

async function clearLocalDatabase() {
    await db.read();

    const stats = {
        salesDeleted: (db.data.sales || []).length,
        expensesDeleted: (db.data.expenses || []).length,
    };

    db.data.sales = [];
    db.data.expenses = [];
    await db.write();

    return stats;
}

async function deleteCloudUserData(userId) {
    const result = {
        salesDeleted: 0,
        expensesDeleted: 0,
        backupsDeleted: 0,
    };

    const salesResult = await supabase
        .from("sales")
        .delete({ count: "exact" })
        .eq("user_id", userId);

    if (salesResult.error) throw new Error(`Sales: ${salesResult.error.message}`);
    result.salesDeleted = salesResult.count || 0;

    const expensesResult = await supabase
        .from("expenses")
        .delete({ count: "exact" })
        .eq("user_id", userId);

    if (expensesResult.error) throw new Error(`Expenses: ${expensesResult.error.message}`);
    result.expensesDeleted = expensesResult.count || 0;

    const backupsResult = await supabase
        .from("backups")
        .delete({ count: "exact" })
        .eq("user_id", userId);

    if (backupsResult.error) throw new Error(`Backups: ${backupsResult.error.message}`);
    result.backupsDeleted = backupsResult.count || 0;

    return result;
}

async function requestRemoteDataWipe(userId) {
    const requestedAt = new Date().toISOString();
    const { error } = await supabase
        .from("licenses")
        .update({
            data_wipe_requested_at: requestedAt,
            data_wipe_completed_at: null,
            data_wipe_reason: WIPE_REASON,
        })
        .eq("id", userId);

    if (error) {
        throw new Error(
            `No se pudo crear solicitud de borrado local. Aplica la migracion de data_wipe en Supabase. ${error.message}`
        );
    }

    return requestedAt;
}

async function completeRemoteDataWipe(userId) {
    const completedAt = new Date().toISOString();
    const { error } = await supabase
        .from("licenses")
        .update({
            data_wipe_completed_at: completedAt,
        })
        .eq("id", userId);

    if (error) {
        throw new Error(`No se pudo marcar el borrado local como completado. ${error.message}`);
    }

    return completedAt;
}

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

// =========================
// ACTUALIZADOR IPC
// =========================
ipcMain.handle("updater:get-status", () => {
    return getUpdateStatus();
});

ipcMain.handle("updater:check", async () => {
    return checkForAppUpdates();
});

ipcMain.handle("updater:download", async () => {
    return downloadAppUpdate();
});

ipcMain.handle("updater:install", async () => {
    return installAppUpdate();
});

ipcMain.handle("updater:dismiss", () => {
    persistUpdateDismissed();
    sendUpdateStatus();
    return getUpdateStatus();
});

// =========================
// 🔐 LICENCIA
// =========================

ipcMain.handle("check-license", async () => {
    try {
        if (!fs.existsSync(licensePath)) return false;

        const data = normalizeLicenseInput(
            JSON.parse(fs.readFileSync(licensePath, "utf8"))
        );

        const { data: lic, error } = await supabase
            .from("licenses")
            .select("*")
            .eq("license_key", data.key)
            .single();

        if (error || !lic) return false;
        if (!lic.active) return false;

        const deviceId = getDeviceId();

        if (lic.device_id && lic.device_id !== deviceId) return false;

        if (!lic.device_id) {
            await supabase
                .from("licenses")
                .update({ device_id: deviceId })
                .eq("id", lic.id);
        }

        return {
            valid: true,
            userId: lic.id,
        };
    } catch (err) {
        console.log("ERROR LICENCIA:", err);
        return false;
    }
});

ipcMain.handle("save-license", (_, data) => {
    const license = normalizeLicenseInput(data);

    fs.writeFileSync(licensePath, JSON.stringify(license), "utf8");
});

ipcMain.handle("get-licenses", async () => {
    const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .order("created_at", { ascending: false });

    return error ? [] : data;
});

ipcMain.handle("validate-license", async (_, data) => {
    try {
        const { email: emailClean, key: keyClean } = normalizeLicenseInput(data);

        const { data: lic, error } = await supabase
            .from("licenses")
            .select("*")
            .eq("license_key", keyClean)
            .single();

        if (error || !lic) {
            return { ok: false, message: "Licencia inválida" };
        }

        if (!lic.active) {
            return { ok: false, message: "Licencia desactivada" };
        }

        const deviceId = getDeviceId();

        if (lic.device_id && lic.device_id !== deviceId) {
            return {
                ok: false,
                message: "Licencia en uso en otro dispositivo",
            };
        }

        if (!lic.device_id) {
            await supabase
                .from("licenses")
                .update({ device_id: deviceId })
                .eq("id", lic.id);
        }

        fs.writeFileSync(
            licensePath,
            JSON.stringify({ email: emailClean, key: keyClean }),
            "utf8"
        );

        return {
            ok: true,
            message: "Licencia activada correctamente",
            userId: lic.id, // 🔥 ESTE ES EL CAMBIO CLAVE
        };
    } catch (err) {
        console.log("💥 ERROR VALIDATE:", err);
        return { ok: false, message: "Error del servidor" };
    }
});

// =========================
// 🛒 VENTAS (LOWDB)
// =========================

ipcMain.handle("get-sales", async () => {
    await db.read();
    return db.data.sales;
});

ipcMain.handle("add-sale", async (_, sale) => {
    const input = normalizeSaleForCreate(sale);

    await db.read();

    const newSale = {
        id: input.id || uuidv4(),
        amount: input.amount,
        payment_method: input.payment_method,
        notes: input.notes,
        sale_date: input.sale_date,
        voided: input.voided,
        updated_at: input.updated_at || new Date().toISOString(),
    };

    db.data.sales.push(newSale);
    await db.write();

    return newSale;
});

ipcMain.handle("update-sale", async (_, updated) => {
    const input = normalizeSaleForUpdate(updated);

    await db.read();

    const index = db.data.sales.findIndex((s) => s.id === input.id);

    if (index !== -1) {
        const changes = { ...input };
        const updatedAt = changes.updated_at;

        delete changes.id;
        delete changes.updated_at;

        db.data.sales[index] = {
            ...db.data.sales[index],
            ...changes,
            updated_at: updatedAt || new Date().toISOString(),
        };
    }

    await db.write();
});

ipcMain.handle("toggle-sale-void", async (_, data) => {
    const input = normalizeSaleVoidToggle(data);

    await db.read();

    const sale = db.data.sales.find((s) => s.id === input.id);
    if (sale) {
        sale.voided = input.voided;
        sale.updated_at = new Date().toISOString();
    }

    await db.write();
});

ipcMain.handle("delete-sale", async (_, id) => {
    const saleId = normalizeId(id);

    await db.read();

    db.data.sales = db.data.sales.filter((s) => s.id !== saleId);

    await db.write();
});

// =========================
// 💰 GASTOS (LOWDB)
// =========================

ipcMain.handle("get-expenses", async () => {
    await db.read();
    return db.data.expenses || [];
});

ipcMain.handle("add-expense", async (_, exp) => {
    const input = normalizeExpenseForCreate(exp);

    await db.read();

    const newExp = {
        id: input.id || uuidv4(),
        updated_at: input.updated_at || new Date().toISOString(),
        concept: input.concept,
        category: input.category,
        amount: input.amount,
        payment_method: input.payment_method,
        status: input.status,
        notes: input.notes,
        expense_date: input.expense_date,
    };

    db.data.expenses ||= [];
    db.data.expenses.push(newExp);

    await db.write();

    return newExp;
});

ipcMain.handle("update-expense", async (_, exp) => {
    const input = normalizeExpenseForUpdate(exp);

    await db.read();

    const index = db.data.expenses.findIndex((e) => e.id === input.id);

    if (index !== -1) {
        const changes = { ...input };
        const updatedAt = changes.updated_at;

        delete changes.id;
        delete changes.updated_at;

        db.data.expenses[index] = {
            ...db.data.expenses[index],
            ...changes,
            updated_at: updatedAt || new Date().toISOString(),
        };
    }

    await db.write();
});

ipcMain.handle("toggle-expense-status", async (_, data) => {
    const input = normalizeExpenseStatusToggle(data);

    await db.read();

    const exp = db.data.expenses.find((e) => e.id === input.id);
    if (exp) {
        exp.status = input.status;
        exp.updated_at = new Date().toISOString();
    }

    await db.write();
});

ipcMain.handle("delete-expense", async (_, id) => {
    const expenseId = normalizeId(id);

    await db.read();

    db.data.expenses = db.data.expenses.filter((e) => e.id !== expenseId);

    await db.write();
});

// =========================
// 🔑 LICENCIAS ADMIN
// =========================

const { generarLicencia } = require("./license.cjs");

ipcMain.handle("generate-license", (_, email) => {
    return generarLicencia(normalizeEmail(email));
});

ipcMain.handle("create-license", async (_, email) => {
    const safeEmail = normalizeEmail(email);
    const key = generarLicencia(safeEmail);

    const { error } = await supabase.from("licenses").insert([
        {
            email: safeEmail,
            license_key: key,
            active: true,
        },
    ]);

    return error ? null : key;
});

ipcMain.handle("toggle-license", async (_, id, status) => {
    const licenseId = normalizeLicenseRecordId(id);
    const active = normalizeBoolean(status, "active");

    const { error } = await supabase
        .from("licenses")
        .update({ active })
        .eq("id", licenseId);

    return !error;
});

ipcMain.handle("delete-license", async (_, id) => {
    const licenseId = normalizeLicenseRecordId(id);

    const { error } = await supabase
        .from("licenses")
        .delete()
        .eq("id", licenseId);

    return !error;
});

ipcMain.handle("delete-user-data", async (_, payload) => {
    try {
        const input = normalizeDeleteUserDataRequest(payload);
        const license = await getLicenseById(input.userId);

        if (String(license.email || "").toLowerCase() !== input.confirmEmail) {
            return {
                ok: false,
                message: "El email de confirmacion no coincide con la licencia.",
            };
        }

        const response = {
            ok: true,
            message: "Operacion de borrado completada.",
            cloudDeleted: null,
            localDeleted: null,
            remoteWipeRequestedAt: null,
        };

        if (input.deleteCloud) {
            response.cloudDeleted = await deleteCloudUserData(input.userId);
        }

        if (input.deleteLocal) {
            const currentLocalUserId = await getCurrentLocalUserId();

            if (String(currentLocalUserId || "") !== String(input.userId)) {
                return {
                    ok: false,
                    message: "Por seguridad, solo se puede borrar la base local si esta licencia corresponde a este equipo.",
                };
            }

            response.localDeleted = await clearLocalDatabase();
        }

        if (input.requestRemoteLocal) {
            response.remoteWipeRequestedAt = await requestRemoteDataWipe(input.userId);
        }

        return response;
    } catch (err) {
        console.error("delete-user-data error:", err);
        return {
            ok: false,
            message: err.message || "No se pudo borrar la base de datos del usuario.",
        };
    }
});

// =========================
// 🔐 LOGIN ADMIN
// =========================

ipcMain.handle("login-admin", async (_, password) => {
    try {
        return await bcrypt.compare(normalizePassword(password), ADMIN_HASH);
    } catch {
        return false;
    }
});

ipcMain.handle("run-pending-data-wipe", async (_, payload) => {
    try {
        const input = normalizeDataWipeRunRequest(payload);
        const currentLocalUserId = await getCurrentLocalUserId();

        if (String(currentLocalUserId || "") !== String(input.userId)) {
            return {
                ok: false,
                wiped: false,
                message: "La licencia local no coincide con la solicitud de borrado.",
            };
        }

        const { data: license, error } = await supabase
            .from("licenses")
            .select("id, data_wipe_requested_at, data_wipe_completed_at")
            .eq("id", input.userId)
            .single();

        if (error) {
            if (/data_wipe_requested_at|data_wipe_completed_at/i.test(error.message || "")) {
                return {
                    ok: true,
                    wiped: false,
                    message: "Borrado remoto local no configurado en Supabase.",
                };
            }

            throw new Error(error.message);
        }

        const requestedAt = license?.data_wipe_requested_at;
        const completedAt = license?.data_wipe_completed_at;

        if (!requestedAt || (completedAt && new Date(completedAt) >= new Date(requestedAt))) {
            return {
                ok: true,
                wiped: false,
                message: "No hay solicitud de borrado local pendiente.",
            };
        }

        const localDeleted = await clearLocalDatabase();
        let cloudDeleted = null;
        let cloudCleanupError = null;

        try {
            cloudDeleted = await deleteCloudUserData(input.userId);
        } catch (cloudErr) {
            cloudCleanupError = cloudErr.message || "No se pudo limpiar Supabase despues del borrado local.";
        }

        await completeRemoteDataWipe(input.userId);

        return {
            ok: true,
            wiped: true,
            localDeleted,
            cloudDeleted,
            cloudCleanupError,
            message: "Base local borrada por solicitud administrativa.",
        };
    } catch (err) {
        console.error("run-pending-data-wipe error:", err);
        return {
            ok: false,
            wiped: false,
            message: err.message || "No se pudo ejecutar el borrado local pendiente.",
        };
    }
});

ipcMain.handle("create-backup", async (_, data) => {
    try {
        const userId = normalizeId(data?.userId, "user_id");
        const source = normalizeBackupSource(data?.source);

        await db.read();

        const payload = createBackupPayload(source);
        const localPath = writeLocalBackup(payload.compressed);

        try {
            const insertPayload = {
                user_id: userId,
                data: payload.data,
                source,
                sales_count: payload.stats.sales_count,
                expenses_count: payload.stats.expenses_count,
                compressed_bytes: payload.stats.compressed_bytes,
                uncompressed_bytes: payload.stats.uncompressed_bytes,
            };
            let insertResult = await withTimeout(
                supabase
                    .from("backups")
                    .insert([insertPayload])
                    .select("id, created_at, source, sales_count, expenses_count, compressed_bytes, uncompressed_bytes")
                    .single(),
                BACKUP_TIMEOUT_MS
            );

            if (
                insertResult.error &&
                /source|sales_count|expenses_count|compressed_bytes|uncompressed_bytes/i.test(insertResult.error.message || "")
            ) {
                insertResult = await withTimeout(
                    supabase
                        .from("backups")
                        .insert([
                            {
                                user_id: userId,
                                data: payload.data,
                            },
                        ])
                        .select("id, created_at")
                        .single(),
                    BACKUP_TIMEOUT_MS
                );
            }

            const { data: backup, error } = insertResult;

            if (error) {
                return {
                    ok: true,
                    cloudOk: false,
                    localPath,
                    stats: payload.stats,
                    error: error.message,
                    message: "Backup local creado, pero no se pudo subir a la nube.",
                };
            }

            return {
                ok: true,
                cloudOk: true,
                backup,
                localPath,
                stats: payload.stats,
                message: "Backup guardado en la nube correctamente.",
            };
        } catch (err) {
            return {
                ok: true,
                cloudOk: false,
                localPath,
                stats: payload.stats,
                error: err.message,
                message: "Backup local creado, pero la nube no respondio.",
            };
        }
    } catch (err) {
        console.error("backup error:", err);
        return {
            ok: false,
            cloudOk: false,
            error: err.message || "No se pudo crear el backup.",
            message: "No se pudo crear el backup.",
        };
    }
});

ipcMain.handle("restore-cloud-backup", async (_, data) => {
    try {
        const result = await restoreCloudBackup(data?.userId, data?.backupId);

        return {
            ok: true,
            result,
            message: `Backup restaurado: ${result.sales_count} ventas y ${result.expenses_count} gastos.`,
        };
    } catch (err) {
        console.error("restore-cloud-backup error:", err);
        return {
            ok: false,
            error: err.message || "No se pudo restaurar el backup.",
            message: "No se pudo restaurar el backup.",
        };
    }
});


ipcMain.handle("restore-data", async (_, backup) => {
    try {
        const { sales, expenses } = normalizeBackupData(backup);
        const restoredAt = new Date().toISOString();

        // 🔥 LEER DB
        await db.read();

        // 🔥 REEMPLAZAR DATOS
        db.data.sales = sales.map((sale) => ({
            ...sale,
            id: sale.id || uuidv4(),
            updated_at: sale.updated_at || restoredAt,
        }));
        db.data.expenses = expenses.map((expense) => ({
            ...expense,
            id: expense.id || uuidv4(),
            updated_at: expense.updated_at || restoredAt,
        }));

        // 🔥 GUARDAR
        await db.write();

        console.log("✅ RESTORE OK");

        return true;
    } catch (err) {
        console.error("❌ restore error:", err);
        return false;
    }
});
