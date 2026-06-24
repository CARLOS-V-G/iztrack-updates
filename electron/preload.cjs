const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const UPDATE_STATUS_CHANNEL = "updater:status";

const api = Object.freeze({
    // ===== SALES =====
    getSales: () => invoke("get-sales"),
    addSale: (sale) => invoke("add-sale", sale),
    updateSale: (sale) => invoke("update-sale", sale),
    toggleSaleVoid: (data) => invoke("toggle-sale-void", data),
    deleteSale: (id) => invoke("delete-sale", id),

    // ===== EXPENSES =====
    getExpenses: () => invoke("get-expenses"),
    addExpense: (expense) => invoke("add-expense", expense),
    updateExpense: (expense) => invoke("update-expense", expense),
    toggleExpenseStatus: (data) => invoke("toggle-expense-status", data),
    deleteExpense: (id) => invoke("delete-expense", id),

    // ===== LICENSES =====
    checkLicense: () => invoke("check-license"),
    validateLicense: (data) => invoke("validate-license", data),
    saveLicense: (data) => invoke("save-license", data),
    getLicenses: () => invoke("get-licenses"),
    generateLicense: (email) => invoke("generate-license", email),
    createLicense: (email) => invoke("create-license", email),
    toggleLicense: (id, status) => invoke("toggle-license", id, status),
    updateLicenseEmail: (id, email) => invoke("update-license-email", id, email),
    deleteLicense: (id) => invoke("delete-license", id),
    deleteUserData: (data) => invoke("delete-user-data", data),
    loginAdmin: (password) => invoke("login-admin", password),
    runPendingDataWipe: (data) => invoke("run-pending-data-wipe", data),

    // ===== BACKUPS =====
    createBackup: (data) => invoke("create-backup", data),
    restoreCloudBackup: (data) => invoke("restore-cloud-backup", data),
    restoreData: (data) => invoke("restore-data", data),
    exportDiagnostics: (context) => invoke("export-diagnostics", context),

    // ===== CASH CLOSURE / PRODUCTS =====
    getCashClosures: () => invoke("get-cash-closures"),
    saveCashClosure: (closure) => invoke("save-cash-closure", closure),
    getProducts: () => invoke("get-products"),
    saveProduct: (product) => invoke("save-product", product),
    deleteProduct: (id) => invoke("delete-product", id),
    getScannerConfig: () => invoke("get-scanner-config"),
    saveScannerConfig: (config) => invoke("save-scanner-config", config),
    toggleScannerMode: (active) => invoke("toggle-scanner-mode", active),
    getAuditLogs: (limit) => invoke("get-audit-logs", limit),

    // ===== UPDATER =====
    getUpdateStatus: () => invoke("updater:get-status"),
    checkForUpdates: () => invoke("updater:check"),
    downloadUpdate: () => invoke("updater:download"),
    installUpdate: () => invoke("updater:install"),
    dismissUpdate: () => invoke("updater:dismiss"),
    onUpdateStatus: (callback) => {
        if (typeof callback !== "function") return () => {};

        const listener = (_event, status) => callback(status);
        ipcRenderer.on(UPDATE_STATUS_CHANNEL, listener);

        return () => {
            ipcRenderer.removeListener(UPDATE_STATUS_CHANNEL, listener);
        };
    },
});

contextBridge.exposeInMainWorld("api", api);
