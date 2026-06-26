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
    type CashClosureStatus = "open" | "closed";

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
        autoInstallCountdown: number;
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
        created_at?: string;
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
        created_at?: string;
        updated_at?: string; // 🔥 TAMBIÉN
    }
    type AmountByPaymentMethod = Record<PaymentMethod, number>;

    interface CashClosure {
        id: string;
        close_date: string;
        counted: AmountByPaymentMethod;
        expected: AmountByPaymentMethod;
        total_sales: number;
        total_paid_expenses: number;
        total_pending_expenses: number;
        net_profit: number;
        difference: number;
        operator_name?: string;
        notes?: string;
        status: CashClosureStatus;
        created_at?: string;
        updated_at?: string;
    }

    interface Product {
        id: string;
        plu: string;
        name: string;
        price_per_kg?: number;
        active: boolean;
        notes?: string;
        created_at?: string;
        updated_at?: string;
    }

    interface ScannerConfig {
        barcode_prefix: string;
        plu_start: number;
        plu_length: number;
        amount_start: number;
        amount_length: number;
        amount_divisor: number;
        auto_open_sale: boolean;
        bring_to_front: boolean;
        play_sound: boolean;
        default_payment_method: PaymentMethod | "";
        max_char_interval: number;
        min_code_length: number;
        updated_at?: string;
    }

    interface ScannerHistoryEntry {
        code: string;
        detected_at: string;
    }

    interface AuditLog {
        id: string;
        action: string;
        entity: string;
        entity_id?: string;
        description?: string;
        created_at: string;
    }

    interface DiagnosticExportContext {
        userId?: string | null;
        backupsVisibleCount?: number;
        latestCloudBackup?: {
            id: string;
            created_at: string;
            source?: string | null;
            sales_count?: number | null;
            expenses_count?: number | null;
        } | null;
        lastAutoBackupAt?: string | null;
        lastAutoBackupLocalAt?: string | null;
        lastAutoBackupError?: string | null;
        updateStatus?: AppUpdateStatus | null;
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
                created_at?: string;
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
                created_at?: string;
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
                created_at?: string;
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
                created_at?: string;
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
                userId?: string;
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
            updateLicenseEmail: (id: string, email: string) => Promise<{
                ok: boolean;
                message: string;
                license?: LicenseDB;
            }>;
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
                    cash_closures_count?: number;
                    products_count?: number;
                    uncompressed_bytes: number;
                    compressed_bytes: number;
                };
                backup?: {
                    id: string;
                    created_at: string;
                };
            }>;
            restoreCloudBackup: (data: {
                userId: string;
                backupId?: string;
            }) => Promise<{
                ok: boolean;
                message: string;
                error?: string;
                result?: {
                    id: string;
                    created_at: string;
                    sales_count: number;
                    expenses_count: number;
                    cash_closures_count?: number;
                    products_count?: number;
                };
            }>;
            restoreData: (data: {
                sales: Sale[];
                expenses: Expense[];
                cash_closures?: CashClosure[];
                products?: Product[];
                audit_logs?: AuditLog[];
                scanner_config?: ScannerConfig;
            }) => Promise<boolean>;
            exportDiagnostics: (context?: DiagnosticExportContext) => Promise<{
                ok: boolean;
                cancelled?: boolean;
                path?: string;
                message: string;
            }>;
            getCashClosures: () => Promise<CashClosure[]>;
            saveCashClosure: (closure: Omit<CashClosure, "id" | "created_at" | "updated_at"> & {
                id?: string;
                created_at?: string;
                updated_at?: string;
            }) => Promise<CashClosure>;
            getProducts: () => Promise<Product[]>;
            saveProduct: (product: Omit<Product, "id" | "created_at" | "updated_at"> & {
                id?: string;
                created_at?: string;
                updated_at?: string;
            }) => Promise<Product>;
            deleteProduct: (id: string) => Promise<void>;
            getScannerConfig: () => Promise<ScannerConfig>;
            saveScannerConfig: (config: ScannerConfig) => Promise<ScannerConfig>;
            getAuditLogs: (limit?: number) => Promise<AuditLog[]>;
            getUpdateStatus: () => Promise<AppUpdateStatus>;
            checkForUpdates: () => Promise<AppUpdateStatus>;
            downloadUpdate: () => Promise<AppUpdateStatus>;
            installUpdate: () => Promise<AppUpdateStatus>;
            dismissUpdate: () => Promise<AppUpdateStatus>;
            onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;

            toggleScannerMode: (active: boolean) => Promise<boolean>;
            onBarcode: (callback: (barcode: string) => void) => () => void;
            setBarcode: (barcode: string) => Promise<boolean>;
            getScannerHistory: () => Promise<ScannerHistoryEntry[]>;
            getScannerBackend: () => Promise<string>;

        };
    }
}
