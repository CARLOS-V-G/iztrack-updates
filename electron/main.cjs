const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const zlib = require("zlib");

// Cargar .env en desarrollo (Node 20+ nativo, sin dependencias extra)
try {
    const envFile = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envFile);
    }
} catch { /* silencioso en produccion */ }

let autoUpdater = null;
let autoUpdaterLoadError = null;

try {
    ({ autoUpdater } = require("electron-updater"));
} catch (err) {
    autoUpdaterLoadError = err;
}

const barcodeScanner = require("./barcode-scanner.cjs");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const {
    normalizeBackupData,
    normalizeBoolean,
    normalizeCashClosureForSave,
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
    normalizeProductForSave,
    normalizeSecondaryProductForSave,
    normalizeSaleForCreate,
    normalizeSaleForUpdate,
    normalizeSaleVoidToggle,
    normalizeScannerConfig,
} = require("./ipcValidation.cjs");

// Config centralizado: lee de env vars, fallback a produccion remota
const config = require("./config.cjs");
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

// LOWDB
const { db, initDB, dbPath } = require("./db/db.cjs");

// Hash bcrypt del panel admin (desde config)
const ADMIN_HASH = config.ADMIN_HASH;

// LICENCIA LOCAL
const licensePath = path.join(app.getPath("userData"), "license.json");

let mainWindow;
const BARCODE_CHANNEL = "mp:barcode";
const scannerHistory = [];

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
const AUTO_INSTALL_DELAY_MS = 60 * 1000;
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
    autoInstallCountdown: 0,
};

let autoInstallTimer = null;

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
            webviewTag: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));

    // Bloquear F12 / Ctrl+Shift+I para que el escáner no abra DevTools
    mainWindow.webContents.on("before-input-event", (event, input) => {
        if (input.key === "F12" || (input.control && input.shift && input.key === "I")) {
            event.preventDefault();
        }
    });
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

function clearAutoInstallCountdown() {
    if (autoInstallTimer) {
        clearInterval(autoInstallTimer);
        autoInstallTimer = null;
    }
    updateRuntime.autoInstallCountdown = 0;
}

function startAutoInstallCountdown() {
    clearAutoInstallCountdown();

    updateRuntime.autoInstallCountdown = Math.floor(AUTO_INSTALL_DELAY_MS / 1000);
    sendUpdateStatus();

    autoInstallTimer = setInterval(() => {
        updateRuntime.autoInstallCountdown--;
        sendUpdateStatus();

        if (updateRuntime.autoInstallCountdown <= 0) {
            clearAutoInstallCountdown();
            installAppUpdate();
        }
    }, 1000);
}

function markNoUpdateAvailable(message = "No hay actualizaciones disponibles.") {
    clearAutoInstallCountdown();
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
        autoInstallCountdown: updateRuntime.autoInstallCountdown || 0,
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

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

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
        updateRuntime.message = "Nueva version detectada, descargando...";
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
        updateRuntime.message = "Actualizacion lista, reiniciando...";
        updateRuntime.error = "";
        sendUpdateStatus();
        startAutoInstallCountdown();
    });

    autoUpdater.on("error", (error) => {
        clearAutoInstallCountdown();
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
    clearAutoInstallCountdown();

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
    clearAutoInstallCountdown();

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

function readLocalLicense() {
    if (!fs.existsSync(licensePath)) {
        throw new Error("No hay licencia local activa.");
    }

    return normalizeLicenseInput(JSON.parse(fs.readFileSync(licensePath, "utf8")));
}

function writeLocalLicense(license) {
    fs.writeFileSync(licensePath, JSON.stringify(license), "utf8");
}

function maskSecret(value) {
    const text = String(value || "");
    if (!text) return "";
    if (text.length <= 8) return "***";

    return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function sanitizeDiagnosticString(value, maxLength = 500) {
    if (value === undefined || value === null) return null;

    return String(value).slice(0, maxLength);
}

function getFileMetadata(filePath) {
    try {
        const stat = fs.statSync(filePath);

        return {
            path: filePath,
            exists: true,
            size_bytes: stat.size,
            modified_at: stat.mtime.toISOString(),
        };
    } catch {
        return {
            path: filePath,
            exists: false,
            size_bytes: 0,
            modified_at: null,
        };
    }
}

function getLatestRecordTimestamp(records, fields) {
    return (records || []).reduce((latest, record) => {
        const value = fields.map((field) => record?.[field]).find(Boolean);
        const timestamp = value ? String(value) : "";

        return timestamp > latest ? timestamp : latest;
    }, "");
}

function getDiagnosticsContext(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

    return {
        user_id: sanitizeDiagnosticString(source.userId, 128),
        backups_visible_count: Number(source.backupsVisibleCount || 0),
        latest_cloud_backup: source.latestCloudBackup || null,
        last_auto_backup_at: sanitizeDiagnosticString(source.lastAutoBackupAt, 64),
        last_auto_backup_local_at: sanitizeDiagnosticString(source.lastAutoBackupLocalAt, 64),
        last_auto_backup_error: sanitizeDiagnosticString(source.lastAutoBackupError, 500),
        update_state: source.updateStatus || null,
    };
}

function getLocalLicenseDiagnostics() {
    try {
        const license = readLocalLicense();

        return {
            present: true,
            email: license.email,
            license_key_masked: maskSecret(license.key),
        };
    } catch (err) {
        return {
            present: false,
            error: err.message || "No se pudo leer la licencia local.",
        };
    }
}

function createDiagnosticsPayload(context) {
    ensureExtendedDataShape();

    return {
        exported_at: new Date().toISOString(),
        app: {
            name: "izTrack",
            version: app.getVersion(),
            packaged: app.isPackaged,
            platform: process.platform,
            arch: process.arch,
            electron: process.versions.electron,
            node: process.versions.node,
        },
        paths: {
            user_data: app.getPath("userData"),
            app_path: app.getAppPath(),
            executable: app.getPath("exe"),
            db: getFileMetadata(dbPath),
            license: getFileMetadata(licensePath),
            update_state: getFileMetadata(getUpdateStatePath()),
        },
        license: getLocalLicenseDiagnostics(),
        data: {
            sales_count: db.data.sales.length,
            expenses_count: db.data.expenses.length,
            cash_closures_count: db.data.cash_closures.length,
            products_count: db.data.products.length,
            active_products_count: db.data.products.filter((product) => product.active !== false).length,
            audit_logs_count: db.data.audit_logs.length,
            latest_sale_at: getLatestRecordTimestamp(db.data.sales, ["updated_at", "created_at", "sale_date"]) || null,
            latest_expense_at:
                getLatestRecordTimestamp(db.data.expenses, ["updated_at", "created_at", "expense_date"]) || null,
            latest_cash_closure_at:
                getLatestRecordTimestamp(db.data.cash_closures, ["updated_at", "created_at", "close_date"]) || null,
            scanner_config: db.data.scanner_config,
        },
        backups: getDiagnosticsContext(context),
        updater: {
            ...getUpdateStatus(),
            load_error: autoUpdaterLoadError ? autoUpdaterLoadError.message : "",
        },
        recent_audit_logs: [...db.data.audit_logs]
            .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
            .slice(0, 20),
    };
}

function normalizeBackupSource(source) {
    return BACKUP_SOURCES.has(source) ? source : "manual";
}

function getDefaultScannerConfig() {
    return {
        barcode_prefix: "2",
        plu_start: 1,
        plu_length: 5,
        amount_start: 6,
        amount_length: 6,
        amount_divisor: 1,
        auto_open_sale: true,
        bring_to_front: true,
        play_sound: true,
        default_payment_method: "",
        max_char_interval: 50,
        min_code_length: 3,
        detect_truncated_amount: true,
    };
}

function ensureExtendedDataShape() {
    db.data ||= {};
    db.data.sales ||= [];
    db.data.expenses ||= [];
    db.data.cash_closures ||= [];
    db.data.products ||= [];
    db.data.secondary_products ||= [];
    db.data.audit_logs ||= [];
    db.data.deleted_licenses ||= [];
    db.data.scanner_config = {
        ...getDefaultScannerConfig(),
        ...(db.data.scanner_config || {}),
    };
}

function compactAmountMap(values) {
    const source = values || {};

    return {
        cash: Number(source.cash || 0),
        debit: Number(source.debit || 0),
        credit: Number(source.credit || 0),
        transfer: Number(source.transfer || 0),
        digital_wallet: Number(source.digital_wallet || 0),
    };
}

function appendAuditLog(action, entity, entityId, description) {
    ensureExtendedDataShape();

    db.data.audit_logs.push({
        id: uuidv4(),
        action,
        entity,
        entity_id: entityId ? String(entityId) : "",
        description: description || "",
        created_at: new Date().toISOString(),
    });

    db.data.audit_logs = db.data.audit_logs
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
        .slice(-500);
}

function compactSaleForBackup(sale) {
    return {
        id: sale.id,
        sale_date: sale.sale_date || sale.date,
        amount: Number(sale.amount || 0),
        payment_method: sale.payment_method || sale.method || "cash",
        notes: sale.notes || "",
        voided: sale.voided ?? false,
        created_at: sale.created_at,
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
        created_at: expense.created_at,
        updated_at: expense.updated_at,
    };
}

function compactCashClosureForBackup(closure) {
    return {
        id: closure.id,
        close_date: closure.close_date,
        counted: compactAmountMap(closure.counted),
        expected: compactAmountMap(closure.expected),
        total_sales: Number(closure.total_sales || 0),
        total_paid_expenses: Number(closure.total_paid_expenses || 0),
        total_pending_expenses: Number(closure.total_pending_expenses || 0),
        net_profit: Number(closure.net_profit || 0),
        difference: Number(closure.difference || 0),
        operator_name: closure.operator_name || "",
        notes: closure.notes || "",
        status: closure.status || "closed",
        created_at: closure.created_at,
        updated_at: closure.updated_at,
    };
}

function compactProductForBackup(product) {
    return {
        id: product.id,
        plu: product.plu,
        name: product.name,
        price_per_kg: Number(product.price_per_kg || 0),
        active: product.active !== false,
        notes: product.notes || "",
        created_at: product.created_at,
        updated_at: product.updated_at,
    };
}

function compactAuditLogForBackup(log) {
    return {
        id: log.id,
        action: log.action,
        entity: log.entity,
        entity_id: log.entity_id || "",
        description: log.description || "",
        created_at: log.created_at,
    };
}

function createBackupPayload(source) {
    ensureExtendedDataShape();

    const sales = (db.data.sales || []).map(compactSaleForBackup);
    const expenses = (db.data.expenses || []).map(compactExpenseForBackup);
    const cash_closures = (db.data.cash_closures || []).map(compactCashClosureForBackup);
    const products = (db.data.products || []).map(compactProductForBackup);
    const secondary_products = db.data.secondary_products || [];
    const audit_logs = (db.data.audit_logs || []).map(compactAuditLogForBackup);
    const jsonPayload = JSON.stringify({
        sales,
        expenses,
        cash_closures,
        products,
        secondary_products,
        audit_logs,
        scanner_config: {
            ...getDefaultScannerConfig(),
            ...(db.data.scanner_config || {}),
        },
        meta: {
            source,
            created_at: new Date().toISOString(),
            sales_count: sales.length,
            expenses_count: expenses.length,
            cash_closures_count: cash_closures.length,
            products_count: products.length,
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
                cash_closures_count: cash_closures.length,
                products_count: products.length,
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
            cash_closures_count: cash_closures.length,
            products_count: products.length,
            secondary_products_count: secondary_products.length,
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
    const { sales, expenses, cash_closures, products, secondary_products, audit_logs, scanner_config } =
        normalizeBackupData(decodedBackup);
    const restoredAt = new Date().toISOString();

    await db.read();
    ensureExtendedDataShape();

    db.data.sales = sales.map((sale) => ({
        ...sale,
        id: sale.id || uuidv4(),
        created_at: sale.created_at || restoredAt,
        updated_at: sale.updated_at || restoredAt,
    }));
    db.data.expenses = expenses.map((expense) => ({
        ...expense,
        id: expense.id || uuidv4(),
        created_at: expense.created_at || restoredAt,
        updated_at: expense.updated_at || restoredAt,
    }));
    db.data.cash_closures = cash_closures.map((closure) => ({
        ...closure,
        id: closure.id || uuidv4(),
        created_at: closure.created_at || restoredAt,
        updated_at: closure.updated_at || restoredAt,
    }));
    db.data.products = products.map((product) => ({
        ...product,
        id: product.id || uuidv4(),
        created_at: product.created_at || restoredAt,
        updated_at: product.updated_at || restoredAt,
    }));
    db.data.secondary_products = (secondary_products || []).map((product) => ({
        ...product,
        id: product.id || uuidv4(),
        created_at: product.created_at || restoredAt,
        updated_at: product.updated_at || restoredAt,
    }));
    db.data.audit_logs = audit_logs.map((log) => ({
        ...log,
        id: log.id || uuidv4(),
        created_at: log.created_at || restoredAt,
    }));
    db.data.scanner_config = {
        ...getDefaultScannerConfig(),
        ...(scanner_config || {}),
    };

    await db.write();

    return {
        id: backup.id,
        created_at: backup.created_at,
        sales_count: db.data.sales.length,
        expenses_count: db.data.expenses.length,
        cash_closures_count: db.data.cash_closures.length,
        products_count: db.data.products.length,
        secondary_products_count: db.data.secondary_products.length,
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

    const license = readLocalLicense();

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
        cashClosuresDeleted: (db.data.cash_closures || []).length,
        productsDeleted: (db.data.products || []).length,
        auditLogsDeleted: (db.data.audit_logs || []).length,
    };

    db.data.sales = [];
    db.data.expenses = [];
    db.data.cash_closures = [];
    db.data.products = [];
    db.data.audit_logs = [];
    db.data.scanner_config = getDefaultScannerConfig();
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
    barcodeScanner.stop();
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
    clearAutoInstallCountdown();
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
            companyId: lic.company_id,
            branchId: lic.branch_id,
        };
    } catch (err) {
        console.log("ERROR LICENCIA:", err);
        return false;
    }
});

ipcMain.handle("save-license", (_, data) => {
    const license = normalizeLicenseInput(data);

    writeLocalLicense(license);
});

// =========================
// 🔗 VINCULACION (codigo IZT)
// =========================

ipcMain.handle("generate-link-code", async () => {
    try {
        if (!fs.existsSync(licensePath)) {
            return { ok: false, error: "No hay licencia local activa." };
        }
        const lic = normalizeLicenseInput(
            JSON.parse(fs.readFileSync(licensePath, "utf8"))
        );
        if (!lic.key) {
            return { ok: false, error: "Licencia local sin key." };
        }

        // Get license record from DB
        const { data: license } = await supabase
            .from("licenses")
            .select("id, company_id, active, branch_id")
            .eq("license_key", lic.key)
            .maybeSingle();

        if (!license) {
            return { ok: false, error: "Licencia no encontrada en el servidor." };
        }
        if (!license.active) {
            return { ok: false, error: "Licencia inactiva." };
        }

        // Generate unique pairing code (always allow re-link)
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        let token = `IZT-${part()}-${part()}`;

        // Ensure uniqueness
        let existing = await supabase.from("pending_links").select("id").eq("token", token).maybeSingle();
        while (existing.data) {
            token = `IZT-${part()}-${part()}`;
            existing = await supabase.from("pending_links").select("id").eq("token", token).maybeSingle();
        }

        const { error } = await supabase.from("pending_links").insert({
            token,
            pc_info: getDeviceId(),
            license_id: license.id,
            branch_name: os.hostname(),
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        if (error) {
            return { ok: false, error: "Error al generar el codigo en el servidor." };
        }

        return { ok: true, token, expires_in: 600 };
    } catch (err) {
        return { ok: false, error: "Error de conexion con el servidor" };
    }
});

ipcMain.handle("check-link-status", async (_, token) => {
    try {
        const { data: link } = await supabase
            .from("pending_links")
            .select("status, expires_at, licenses!inner(company_id, branch_id)")
            .eq("token", token.toUpperCase())
            .maybeSingle();

        if (!link) {
            return { status: "invalid" };
        }

        if (link.status === "used" && link.licenses) {
            return {
                status: "linked",
                company_id: link.licenses.company_id,
                branch_id: link.licenses.branch_id,
            };
        }

        if (link.status === "expired" || new Date(link.expires_at) < new Date()) {
            if (link.status === "pending") {
                await supabase.from("pending_links").update({ status: "expired" }).eq("token", token.toUpperCase());
            }
            return { status: "expired" };
        }

        return { status: "pending" };
    } catch {
        return { status: "error" };
    }
});

ipcMain.handle("toggle-scanner-mode", (_, active) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    if (active) {
        const hwndBuf = mainWindow.getNativeWindowHandle();
        const hwnd = hwndBuf.readUInt32LE(0);
        const ok = barcodeScanner.start((barcode) => {
            if (!mainWindow || mainWindow.isDestroyed()) return;

            scannerHistory.push({
                code: barcode,
                detected_at: new Date().toISOString(),
            });
            if (scannerHistory.length > 100) scannerHistory.shift();

            mainWindow.show();
            mainWindow.focus();
            mainWindow.moveTop();
            mainWindow.webContents.send(BARCODE_CHANNEL, barcode);
        }, hwnd);
        return ok;
    }

    barcodeScanner.stop();
    return true;
});

ipcMain.handle("set-barcode", (_, barcode) => {
    if (mainWindow && !mainWindow.isDestroyed() && typeof barcode === "string") {
        if (barcodeScanner.isActive()) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.moveTop();
        }
        mainWindow.webContents.send(BARCODE_CHANNEL, barcode);
        return true;
    }
    return false;
});

ipcMain.handle("get-scanner-history", () => {
    return [...scannerHistory];
});

ipcMain.handle("get-scanner-backend", () => {
    return barcodeScanner.getBackendName();
});

ipcMain.handle("get-scanner-status", () => {
    return {
        backend: barcodeScanner.getBackendName(),
        active: barcodeScanner.isActive(),
    };
});

ipcMain.handle("get-licenses", async () => {
    const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) return [];

    await db.read();
    ensureExtendedDataShape();
    const deletedIds = new Set(db.data.deleted_licenses || []);

    return data.filter((lic) => !deletedIds.has(lic.id));
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
            userId: lic.id,
            companyId: lic.company_id,
            branchId: lic.branch_id,
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
    ensureExtendedDataShape();
    return db.data.sales;
});

ipcMain.handle("add-sale", async (_, sale) => {
    const input = normalizeSaleForCreate(sale);

    await db.read();
    ensureExtendedDataShape();
    const now = new Date().toISOString();

    const newSale = {
        id: input.id || uuidv4(),
        amount: input.amount,
        payment_method: input.payment_method,
        notes: input.notes,
        sale_date: input.sale_date,
        voided: input.voided,
        created_at: input.created_at || input.updated_at || now,
        updated_at: input.updated_at || now,
    };

    db.data.sales.push(newSale);
    appendAuditLog(
        "create",
        "sale",
        newSale.id,
        `Venta registrada por $ ${Number(newSale.amount).toLocaleString("es-AR")}`,
    );
    await db.write();

    return newSale;
});

ipcMain.handle("update-sale", async (_, updated) => {
    const input = normalizeSaleForUpdate(updated);

    await db.read();
    ensureExtendedDataShape();

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
        appendAuditLog("update", "sale", input.id, "Venta editada");
    }

    await db.write();
});

ipcMain.handle("toggle-sale-void", async (_, data) => {
    const input = normalizeSaleVoidToggle(data);

    await db.read();
    ensureExtendedDataShape();

    const sale = db.data.sales.find((s) => s.id === input.id);
    if (sale) {
        sale.voided = input.voided;
        sale.updated_at = new Date().toISOString();
        appendAuditLog(
            input.voided ? "void" : "restore",
            "sale",
            input.id,
            input.voided ? "Venta anulada" : "Venta reactivada",
        );
    }

    await db.write();
});

ipcMain.handle("delete-sale", async (_, id) => {
    const saleId = normalizeId(id);

    await db.read();
    ensureExtendedDataShape();

    const sale = db.data.sales.find((s) => s.id === saleId);
    db.data.sales = db.data.sales.filter((s) => s.id !== saleId);
    appendAuditLog(
        "delete",
        "sale",
        saleId,
        sale ? `Venta eliminada por $ ${Number(sale.amount || 0).toLocaleString("es-AR")}` : "Venta eliminada",
    );

    await db.write();
});

// =========================
// 💰 GASTOS (LOWDB)
// =========================

ipcMain.handle("get-expenses", async () => {
    await db.read();
    ensureExtendedDataShape();
    return db.data.expenses || [];
});

ipcMain.handle("add-expense", async (_, exp) => {
    const input = normalizeExpenseForCreate(exp);

    await db.read();
    ensureExtendedDataShape();
    const now = new Date().toISOString();

    const newExp = {
        id: input.id || uuidv4(),
        created_at: input.created_at || input.updated_at || now,
        updated_at: input.updated_at || now,
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
    appendAuditLog(
        "create",
        "expense",
        newExp.id,
        `Gasto registrado: ${newExp.concept} por $ ${Number(newExp.amount).toLocaleString("es-AR")}`,
    );

    await db.write();

    return newExp;
});

ipcMain.handle("update-expense", async (_, exp) => {
    const input = normalizeExpenseForUpdate(exp);

    await db.read();
    ensureExtendedDataShape();

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
        appendAuditLog("update", "expense", input.id, "Gasto editado");
    }

    await db.write();
});

ipcMain.handle("toggle-expense-status", async (_, data) => {
    const input = normalizeExpenseStatusToggle(data);

    await db.read();
    ensureExtendedDataShape();

    const exp = db.data.expenses.find((e) => e.id === input.id);
    if (exp) {
        exp.status = input.status;
        exp.updated_at = new Date().toISOString();
        appendAuditLog(
            "status",
            "expense",
            input.id,
            input.status === "paid" ? "Gasto marcado como pagado" : "Gasto marcado como pendiente",
        );
    }

    await db.write();
});

ipcMain.handle("delete-expense", async (_, id) => {
    const expenseId = normalizeId(id);

    await db.read();
    ensureExtendedDataShape();

    const expense = db.data.expenses.find((e) => e.id === expenseId);
    db.data.expenses = db.data.expenses.filter((e) => e.id !== expenseId);
    appendAuditLog(
        "delete",
        "expense",
        expenseId,
        expense ? `Gasto eliminado: ${expense.concept}` : "Gasto eliminado",
    );

    await db.write();
});

// =========================
// CIERRE DE CAJA, PRODUCTOS Y AUDITORIA
// =========================

ipcMain.handle("get-cash-closures", async () => {
    await db.read();
    ensureExtendedDataShape();

    return db.data.cash_closures || [];
});

ipcMain.handle("save-cash-closure", async (_, closure) => {
    const input = normalizeCashClosureForSave(closure);

    await db.read();
    ensureExtendedDataShape();

    const now = new Date().toISOString();
    const existingIndex = db.data.cash_closures.findIndex(
        (item) => item.id === input.id || item.close_date === input.close_date,
    );

    const savedClosure = {
        ...(existingIndex >= 0 ? db.data.cash_closures[existingIndex] : {}),
        ...input,
        id: input.id || (existingIndex >= 0 ? db.data.cash_closures[existingIndex].id : uuidv4()),
        created_at:
            existingIndex >= 0
                ? db.data.cash_closures[existingIndex].created_at || input.created_at || now
                : input.created_at || now,
        updated_at: input.updated_at || now,
    };

    if (existingIndex >= 0) {
        db.data.cash_closures[existingIndex] = savedClosure;
    } else {
        db.data.cash_closures.push(savedClosure);
    }

    appendAuditLog(
        existingIndex >= 0 ? "update" : "create",
        "cash_closure",
        savedClosure.id,
        `Cierre de caja ${savedClosure.close_date} guardado con diferencia $ ${Number(savedClosure.difference || 0).toLocaleString("es-AR")}`,
    );

    await db.write();
    return savedClosure;
});

ipcMain.handle("get-products", async () => {
    await db.read();
    ensureExtendedDataShape();

    return db.data.products || [];
});

ipcMain.handle("save-product", async (_, product) => {
    const input = normalizeProductForSave(product);

    await db.read();
    ensureExtendedDataShape();

    const now = new Date().toISOString();
    const existingIndex = db.data.products.findIndex(
        (item) => item.id === input.id || item.plu === input.plu,
    );

    const savedProduct = {
        ...(existingIndex >= 0 ? db.data.products[existingIndex] : {}),
        ...input,
        id: input.id || (existingIndex >= 0 ? db.data.products[existingIndex].id : uuidv4()),
        created_at:
            existingIndex >= 0
                ? db.data.products[existingIndex].created_at || input.created_at || now
                : input.created_at || now,
        updated_at: input.updated_at || now,
    };

    if (existingIndex >= 0) {
        db.data.products[existingIndex] = savedProduct;
    } else {
        db.data.products.push(savedProduct);
    }

    appendAuditLog(
        existingIndex >= 0 ? "update" : "create",
        "product",
        savedProduct.id,
        `Producto PLU ${savedProduct.plu} guardado: ${savedProduct.name}`,
    );

    await db.write();
    return savedProduct;
});

ipcMain.handle("delete-product", async (_, id) => {
    const productId = normalizeId(id);

    await db.read();
    ensureExtendedDataShape();

    const product = db.data.products.find((item) => item.id === productId);
    db.data.products = db.data.products.filter((item) => item.id !== productId);

    appendAuditLog(
        "delete",
        "product",
        productId,
        product ? `Producto PLU ${product.plu} eliminado` : "Producto eliminado",
    );

    await db.write();
});

ipcMain.handle("get-secondary-products", async () => {
    await db.read();
    ensureExtendedDataShape();
    return db.data.secondary_products || [];
});

ipcMain.handle("save-secondary-product", async (_, product) => {
    const input = normalizeSecondaryProductForSave(product);

    await db.read();
    ensureExtendedDataShape();

    const now = new Date().toISOString();
    const existingIndex = db.data.secondary_products.findIndex(
        (item) => item.id === input.id || item.barcode === input.barcode,
    );

    const savedProduct = {
        ...(existingIndex >= 0 ? db.data.secondary_products[existingIndex] : {}),
        ...input,
        id: input.id || (existingIndex >= 0 ? db.data.secondary_products[existingIndex].id : uuidv4()),
        created_at:
            existingIndex >= 0
                ? db.data.secondary_products[existingIndex].created_at || input.created_at || now
                : input.created_at || now,
        updated_at: input.updated_at || now,
    };

    if (existingIndex >= 0) {
        db.data.secondary_products[existingIndex] = savedProduct;
    } else {
        db.data.secondary_products.push(savedProduct);
    }

    appendAuditLog(
        existingIndex >= 0 ? "update" : "create",
        "secondary_product",
        savedProduct.id,
        `Producto secundario codigo ${savedProduct.barcode} guardado: ${savedProduct.name}`,
    );

    await db.write();
    return savedProduct;
});

ipcMain.handle("delete-secondary-product", async (_, id) => {
    const productId = normalizeId(id);

    await db.read();
    ensureExtendedDataShape();

    const product = db.data.secondary_products.find((item) => item.id === productId);
    db.data.secondary_products = db.data.secondary_products.filter((item) => item.id !== productId);

    appendAuditLog(
        "delete",
        "secondary_product",
        productId,
        product ? `Producto secundario ${product.name} (${product.barcode}) eliminado` : "Producto secundario eliminado",
    );

    await db.write();
});

ipcMain.handle("get-scanner-config", async () => {
    await db.read();
    ensureExtendedDataShape();

    return db.data.scanner_config;
});

ipcMain.handle("save-scanner-config", async (_, config) => {
    const input = normalizeScannerConfig(config);

    await db.read();
    ensureExtendedDataShape();

    db.data.scanner_config = {
        ...getDefaultScannerConfig(),
        ...input,
        updated_at: new Date().toISOString(),
    };

    appendAuditLog("update", "scanner_config", "scanner_config", "Configuracion del escaner actualizada");

    await db.write();
    return db.data.scanner_config;
});

ipcMain.handle("get-audit-logs", async (_, limit = 80) => {
    await db.read();
    ensureExtendedDataShape();

    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 80));

    return [...(db.data.audit_logs || [])]
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .slice(0, safeLimit);
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

    await db.read();
    ensureExtendedDataShape();

    // Una sola licencia por email
    const { data: existing } = await supabase
        .from("licenses")
        .select("id, license_key, active")
        .eq("email", safeEmail)
        .maybeSingle();

    if (existing) {
        // Restaurar si estaba oculta localmente
        db.data.deleted_licenses = (db.data.deleted_licenses || []).filter((id) => id !== existing.id);
        await db.write();
        console.log("📦 Licencia ya existe para", safeEmail, "->", existing.license_key);
        return existing.license_key;
    }

    // Generar clave única (base HMAC + timestamp para evitar colisiones)
    const baseKey = generarLicencia(safeEmail);
    const uniqueKey = baseKey + "-" + Date.now().toString(36).toUpperCase();

    const { data: inserted, error } = await supabase
        .from("licenses")
        .insert([{ email: safeEmail, license_key: uniqueKey, active: true }])
        .select()
        .single();

    if (error) {
        console.log("❌ create-license ERROR:", JSON.stringify(error));
        return null;
    }

    console.log("✅ create-license OK:", uniqueKey);
    return uniqueKey;
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

ipcMain.handle("update-license-email", async (_, id, email) => {
    try {
        const licenseId = normalizeLicenseRecordId(id);
        const safeEmail = normalizeEmail(email);

        const { data: currentLicense, error: currentError } = await supabase
            .from("licenses")
            .select("id, email, license_key, active, device_id")
            .eq("id", licenseId)
            .single();

        if (currentError || !currentLicense) {
            return {
                ok: false,
                message: "No se encontro la licencia.",
            };
        }

        if (String(currentLicense.email || "").toLowerCase() === safeEmail) {
            return {
                ok: true,
                message: "El email ya estaba cargado en esta licencia.",
                license: currentLicense,
            };
        }

        const { data: duplicateEmails, error: duplicateError } = await supabase
            .from("licenses")
            .select("id")
            .eq("email", safeEmail)
            .neq("id", licenseId)
            .limit(1);

        if (duplicateError) {
            return {
                ok: false,
                message: duplicateError.message || "No se pudo validar el email.",
            };
        }

        if (duplicateEmails?.length) {
            return {
                ok: false,
                message: "Ese email ya esta usado por otra licencia.",
            };
        }

        const { data: updatedLicense, error: updateError } = await supabase
            .from("licenses")
            .update({ email: safeEmail })
            .eq("id", licenseId)
            .select("id, email, license_key, active, device_id")
            .single();

        if (updateError || !updatedLicense) {
            return {
                ok: false,
                message: updateError?.message || "No se pudo actualizar el email.",
            };
        }

        return {
            ok: true,
            message: "Email actualizado sin cambiar la licencia ni los datos del cliente.",
            license: updatedLicense,
        };
    } catch (err) {
        return {
            ok: false,
            message: err.message || "No se pudo actualizar el email.",
        };
    }
});

ipcMain.handle("delete-license", async (_, id) => {
    const licenseId = normalizeLicenseRecordId(id);

    // Marcar como inactiva en Supabase (best-effort, puede fallar por RLS)
    await supabase.from("licenses").update({ active: false }).eq("id", licenseId);

    // Guardar el ID en LowDB para ocultarlo siempre
    await db.read();
    ensureExtendedDataShape();

    if (!db.data.deleted_licenses.includes(licenseId)) {
        db.data.deleted_licenses.push(licenseId);
    }

    await db.write();

    console.log("🗑️ Licencia oculta localmente:", licenseId);
    return true;
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
        const userId = normalizeId(data?.userId || data?.user_id, "user_id");
        const companyId = data?.companyId || null;
        const branchId = data?.branchId || null;
        const source = normalizeBackupSource(data?.source);

        await db.read();

        const payload = createBackupPayload(source);
        const localPath = writeLocalBackup(payload.compressed);

        try {
            const insertPayload = {
                user_id: userId,
                company_id: companyId,
                branch_id: branchId,
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
                                company_id: companyId,
                                branch_id: branchId,
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
        const { sales, expenses, cash_closures, products, secondary_products, audit_logs, scanner_config } =
            normalizeBackupData(backup);
        const restoredAt = new Date().toISOString();

        // 🔥 LEER DB
        await db.read();
        ensureExtendedDataShape();

        // 🔥 REEMPLAZAR DATOS
        db.data.sales = sales.map((sale) => ({
            ...sale,
            id: sale.id || uuidv4(),
            created_at: sale.created_at || restoredAt,
            updated_at: sale.updated_at || restoredAt,
        }));
        db.data.expenses = expenses.map((expense) => ({
            ...expense,
            id: expense.id || uuidv4(),
            created_at: expense.created_at || restoredAt,
            updated_at: expense.updated_at || restoredAt,
        }));

        db.data.cash_closures = cash_closures.map((closure) => ({
            ...closure,
            id: closure.id || uuidv4(),
            created_at: closure.created_at || restoredAt,
            updated_at: closure.updated_at || restoredAt,
        }));
        db.data.products = products.map((product) => ({
            ...product,
            id: product.id || uuidv4(),
            created_at: product.created_at || restoredAt,
            updated_at: product.updated_at || restoredAt,
        }));
        db.data.secondary_products = (secondary_products || []).map((product) => ({
            ...product,
            id: product.id || uuidv4(),
            created_at: product.created_at || restoredAt,
            updated_at: product.updated_at || restoredAt,
        }));
        db.data.audit_logs = audit_logs.map((log) => ({
            ...log,
            id: log.id || uuidv4(),
            created_at: log.created_at || restoredAt,
        }));
        db.data.scanner_config = {
            ...getDefaultScannerConfig(),
            ...(scanner_config || {}),
        };

        // 🔥 GUARDAR
        await db.write();

        console.log("✅ RESTORE OK");

        return true;
    } catch (err) {
        console.error("❌ restore error:", err);
        return false;
    }
});

ipcMain.handle("export-diagnostics", async (_, context) => {
    try {
        await db.read();
        const payload = createDiagnosticsPayload(context);
        const fileStamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .replace("T", "_")
            .slice(0, 19);
        const dialogOptions = {
            title: "Guardar diagnostico de izTrack",
            defaultPath: path.join(app.getPath("desktop"), `iztrack-diagnostico-${fileStamp}.json`),
            filters: [{ name: "JSON", extensions: ["json"] }],
        };
        const result = mainWindow
            ? await dialog.showSaveDialog(mainWindow, dialogOptions)
            : await dialog.showSaveDialog(dialogOptions);

        if (result.canceled || !result.filePath) {
            return {
                ok: false,
                cancelled: true,
                message: "Exportacion cancelada.",
            };
        }

        fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), "utf8");

        return {
            ok: true,
            path: result.filePath,
            message: "Diagnostico exportado correctamente.",
        };
    } catch (err) {
        return {
            ok: false,
            message: err.message || "No se pudo exportar el diagnostico.",
        };
    }
});

