export { };

declare global {
    // ======================
    // 💳 TIPOS GENERALES
    // ======================

    type PaymentMethod =
        | "cash"
        | "debit"
        | "credit"
        | "transfer"
        | "digital_wallet";

    type ExpenseStatus = "paid" | "pending";

    type UpdateStatusState =
        | "idle"
        | "checking"
        | "available"
        | "not-available"
        | "downloading"
        | "downloaded"
        | "error"
        | "unsupported";

    type AppUpdateStatus = {
        supported: boolean;
        installedDependency: boolean;
        packaged: boolean;
        state: UpdateStatusState;
        currentVersion: string;
        availableVersion: string | null;
        downloadedVersion: string | null;
        updateDetectedAt: string | null;
        mandatoryAt: string | null;
        isMandatory: boolean;
        percent: number;
        bytesPerSecond: number;
        transferred: number;
        total: number;
        dismissedAt: string | null;
        message: string;
        error: string;
    };

    type License = {
        id: number;
        email: string;
        key: string;
        status: "active" | "blocked";
    };

    // ======================
    // 🧾 VENTAS
    // ======================

    interface Sale {
        id: string;
        amount: number;
        payment_method: PaymentMethod;
        notes?: string;
        voided: boolean;
        sale_date: string;
        updated_at?: string; // 🔥 AGREGAR ESTO
    }

    // ======================
    // 💸 GASTOS
    // ======================

    interface Expense {
        id: string;
        concept: string;
        category: string;
        amount: number;
        payment_method: PaymentMethod;
        status: ExpenseStatus;
        notes?: string;
        expense_date: string;
        updated_at?: string; // 🔥 TAMBIÉN
    }
    type LicenseDB = {
        id: string;
        email: string;
        license_key: string;
        active: boolean;
        device_id: string | null;
    };

    // ======================
    // 🌐 WINDOW API (ELECTRON)
    // ======================

    interface Window {
        api: {
            // ===== SALES =====
            getSales: () => Promise<Sale[]>;
            addSale: (sale: {
                id?: string;
                date?: string;
                sale_date?: string;
                amount: number;
                method?: PaymentMethod;
                payment_method?: PaymentMethod;
                notes?: string;
                voided?: boolean;
                updated_at?: string;
            }) => Promise<Sale>;

            updateSale: (sale: {
                id: string;
                date?: string;
                sale_date?: string;
                amount?: number;
                method?: PaymentMethod;
                payment_method?: PaymentMethod;
                notes?: string;
                voided?: boolean;
                updated_at?: string;
            }) => Promise<void>;

            toggleSaleVoid: (data: {
                id: string;
                voided: boolean;
            }) => Promise<void>;

            deleteSale: (id: string) => Promise<void>;

            // ===== EXPENSES =====
            getExpenses: () => Promise<Expense[]>;

            addExpense: (exp: {
                id?: string;
                date?: string;
                expense_date?: string;
                concept: string;
                category: string;
                amount: number;
                payment_method: PaymentMethod;
                status: ExpenseStatus;
                notes?: string;
                updated_at?: string;
            }) => Promise<Expense>;

            updateExpense: (exp: {
                id: string;
                date?: string;
                expense_date?: string;
                concept?: string;
                category?: string;
                amount?: number;
                payment_method?: PaymentMethod;
                status?: ExpenseStatus;
                notes?: string;
                updated_at?: string;
            }) => Promise<void>;

            toggleExpenseStatus: (data: {
                id: string;
                status: ExpenseStatus;
            }) => Promise<void>;

            checkLicense: () => Promise<{
                valid: boolean;
                userId?: string;
            }>;
            validateLicense: (data: {
                email: string;
                key: string;
            }) => Promise<{
                ok: boolean;
                message: string;
            }>;
            saveLicense: (data: {
                email: string;
                key: string;
            }) => Promise<void>;

            deleteExpense: (id: string) => Promise<void>;

            getLicenses: () => Promise<LicenseDB[]>;
            generateLicense: (email: string) => Promise<string>;
            createLicense: (email: string) => Promise<string | null>;
            toggleLicense: (id: string, status: boolean) => Promise<boolean>;
            deleteLicense: (id: string) => Promise<boolean>;
            deleteUserData: (data: {
                userId: string;
                confirmEmail: string;
                confirmPhrase: string;
                deleteCloud: boolean;
                deleteLocal: boolean;
                requestRemoteLocal: boolean;
            }) => Promise<{
                ok: boolean;
                message: string;
                cloudDeleted?: {
                    salesDeleted: number;
                    expensesDeleted: number;
                    backupsDeleted: number;
                } | null;
                localDeleted?: {
                    salesDeleted: number;
                    expensesDeleted: number;
                } | null;
                remoteWipeRequestedAt?: string | null;
            }>;
            loginAdmin: (password: string) => Promise<boolean>;
            runPendingDataWipe: (data: {
                userId: string;
            }) => Promise<{
                ok: boolean;
                wiped: boolean;
                message: string;
                localDeleted?: {
                    salesDeleted: number;
                    expensesDeleted: number;
                };
                cloudDeleted?: {
                    salesDeleted: number;
                    expensesDeleted: number;
                    backupsDeleted: number;
                } | null;
                cloudCleanupError?: string | null;
            }>;
            createBackup: (data: {
                userId: string;
                source?: "manual" | "automatic" | "migration";
            }) => Promise<{
                ok: boolean;
                cloudOk: boolean;
                message: string;
                error?: string;
                localPath?: string;
                stats?: {
                    sales_count: number;
                    expenses_count: number;
                    uncompressed_bytes: number;
                    compressed_bytes: number;
                };
                backup?: {
                    id: string;
                    created_at: string;
                };
            }>;
            restoreData: (data: {
                sales: Sale[];
                expenses: Expense[];
            }) => Promise<boolean>;
            getUpdateStatus: () => Promise<AppUpdateStatus>;
            checkForUpdates: () => Promise<AppUpdateStatus>;
            downloadUpdate: () => Promise<AppUpdateStatus>;
            installUpdate: () => Promise<AppUpdateStatus>;
            dismissUpdate: () => Promise<AppUpdateStatus>;
            onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;

        };
    }
}
