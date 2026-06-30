const PAYMENT_METHODS = new Set([
    "cash",
    "debit",
    "credit",
    "transfer",
    "digital_wallet",
]);

const EXPENSE_STATUSES = new Set(["paid", "pending"]);
const MAX_TEXT_LENGTH = 500;
const MAX_SHORT_TEXT_LENGTH = 120;
const MAX_BACKUP_ITEMS = 100000;
const DATA_DELETE_CONFIRM_PHRASE = "ELIMINAR DATOS";
const DEFAULT_SCANNER_CONFIG = {
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

function invalid(message) {
    const error = new Error(message);
    error.code = "ERR_INVALID_IPC_PAYLOAD";
    throw error;
}

function assertPlainObject(value, fieldName) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid(`${fieldName} invalido`);
    }

    return value;
}

function normalizeString(value, fieldName, maxLength = MAX_SHORT_TEXT_LENGTH, allowEmpty = false) {
    if (typeof value !== "string") {
        invalid(`${fieldName} debe ser texto`);
    }

    const normalized = value.trim();

    if (!allowEmpty && normalized.length === 0) {
        invalid(`${fieldName} es obligatorio`);
    }

    if (normalized.length > maxLength) {
        invalid(`${fieldName} supera el largo permitido`);
    }

    return normalized;
}

function normalizeOptionalString(value, fieldName, maxLength = MAX_TEXT_LENGTH) {
    if (value === undefined || value === null) return "";

    return normalizeString(value, fieldName, maxLength, true);
}

function normalizeEmail(value) {
    const email = normalizeString(value, "email", 254).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalid("email invalido");
    }

    return email;
}

function normalizeLicenseKey(value) {
    const key = normalizeString(value, "license_key", 80).toUpperCase();

    if (!/^IZ-[A-Z0-9]{8,64}$/.test(key)) {
        invalid("license_key invalida");
    }

    return key;
}

function normalizePassword(value) {
    return normalizeString(value, "password", 256);
}

function normalizeId(value, fieldName = "id") {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value <= 0) {
            invalid(`${fieldName} invalido`);
        }

        return String(value);
    }

    const id = normalizeString(value, fieldName, 128);

    if (!/^[A-Za-z0-9_.:-]+$/.test(id)) {
        invalid(`${fieldName} contiene caracteres no permitidos`);
    }

    return id;
}

function normalizeLicenseRecordId(value) {
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value <= 0) {
            invalid("license_id invalido");
        }

        return value;
    }

    return normalizeId(value, "license_id");
}

function normalizeBoolean(value, fieldName) {
    if (typeof value !== "boolean") {
        invalid(`${fieldName} debe ser booleano`);
    }

    return value;
}

function normalizePositiveAmount(value, fieldName = "amount") {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        invalid(`${fieldName} debe ser mayor a cero`);
    }

    return amount;
}

function normalizeNonNegativeAmount(value, fieldName = "amount") {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        invalid(`${fieldName} no puede ser negativo`);
    }

    return amount;
}

function normalizeInteger(value, fieldName, min, max) {
    const number = Number(value);

    if (!Number.isInteger(number) || number < min || number > max) {
        invalid(`${fieldName} fuera de rango`);
    }

    return number;
}

function normalizeDate(value, fieldName) {
    const rawDate = normalizeString(value, fieldName, 64);
    const date = rawDate.slice(0, 10);
    const separator = rawDate[10];

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        (rawDate.length > 10 && separator !== "T" && separator !== " ")
    ) {
        invalid(`${fieldName} debe usar formato YYYY-MM-DD`);
    }

    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        invalid(`${fieldName} invalida`);
    }

    return date;
}

function normalizeTimestamp(value, fieldName = "updated_at") {
    if (value === undefined || value === null || value === "") return undefined;

    const timestamp = normalizeString(value, fieldName, 64);
    const parsed = new Date(timestamp);

    if (Number.isNaN(parsed.getTime())) {
        invalid(`${fieldName} invalido`);
    }

    return parsed.toISOString();
}

function normalizePaymentMethod(value) {
    const method = normalizeString(value, "payment_method", 32);

    if (!PAYMENT_METHODS.has(method)) {
        invalid("payment_method invalido");
    }

    return method;
}

function normalizeExpenseStatus(value) {
    const status = normalizeString(value, "status", 16);

    if (!EXPENSE_STATUSES.has(status)) {
        invalid("status invalido");
    }

    return status;
}

function normalizeLicenseInput(value) {
    const data = assertPlainObject(value, "license");

    return {
        email: normalizeEmail(data.email),
        key: normalizeLicenseKey(data.key),
    };
}

function normalizeSaleForCreate(value) {
    const sale = assertPlainObject(value, "sale");
    const normalized = {
        amount: normalizePositiveAmount(sale.amount),
        payment_method: normalizePaymentMethod(sale.payment_method ?? sale.method),
        notes: normalizeOptionalString(sale.notes, "notes"),
        sale_date: normalizeDate(sale.sale_date ?? sale.date, "sale_date"),
        voided: sale.voided === undefined ? false : normalizeBoolean(sale.voided, "voided"),
        created_at: normalizeTimestamp(sale.created_at, "created_at"),
        updated_at: normalizeTimestamp(sale.updated_at),
    };

    if (sale.id !== undefined && sale.id !== null) {
        normalized.id = normalizeId(sale.id);
    }

    return normalized;
}

function normalizeSaleForUpdate(value) {
    const sale = assertPlainObject(value, "sale");
    const normalized = {
        id: normalizeId(sale.id),
    };

    if (sale.amount !== undefined) {
        normalized.amount = normalizePositiveAmount(sale.amount);
    }

    if (sale.payment_method !== undefined || sale.method !== undefined) {
        normalized.payment_method = normalizePaymentMethod(sale.payment_method ?? sale.method);
    }

    if (sale.notes !== undefined) {
        normalized.notes = normalizeOptionalString(sale.notes, "notes");
    }

    if (sale.sale_date !== undefined || sale.date !== undefined) {
        normalized.sale_date = normalizeDate(sale.sale_date ?? sale.date, "sale_date");
    }

    if (sale.voided !== undefined) {
        normalized.voided = normalizeBoolean(sale.voided, "voided");
    }

    if (sale.updated_at !== undefined) {
        normalized.updated_at = normalizeTimestamp(sale.updated_at);
    }

    return normalized;
}

function normalizeSaleVoidToggle(value) {
    const data = assertPlainObject(value, "sale_void_toggle");

    return {
        id: normalizeId(data.id),
        voided: normalizeBoolean(data.voided, "voided"),
    };
}

function normalizeExpenseForCreate(value) {
    const expense = assertPlainObject(value, "expense");
    const normalized = {
        concept: normalizeString(expense.concept, "concept", MAX_SHORT_TEXT_LENGTH),
        category: normalizeOptionalString(expense.category, "category", MAX_SHORT_TEXT_LENGTH),
        amount: normalizePositiveAmount(expense.amount),
        payment_method: normalizePaymentMethod(expense.payment_method ?? expense.method),
        status: normalizeExpenseStatus(expense.status ?? "pending"),
        notes: normalizeOptionalString(expense.notes, "notes"),
        expense_date: normalizeDate(expense.expense_date ?? expense.date, "expense_date"),
        created_at: normalizeTimestamp(expense.created_at, "created_at"),
        updated_at: normalizeTimestamp(expense.updated_at),
    };

    if (expense.id !== undefined && expense.id !== null) {
        normalized.id = normalizeId(expense.id);
    }

    return normalized;
}

function normalizeExpenseForUpdate(value) {
    const expense = assertPlainObject(value, "expense");
    const normalized = {
        id: normalizeId(expense.id),
    };

    if (expense.concept !== undefined) {
        normalized.concept = normalizeString(expense.concept, "concept", MAX_SHORT_TEXT_LENGTH);
    }

    if (expense.category !== undefined) {
        normalized.category = normalizeOptionalString(expense.category, "category", MAX_SHORT_TEXT_LENGTH);
    }

    if (expense.amount !== undefined) {
        normalized.amount = normalizePositiveAmount(expense.amount);
    }

    if (expense.payment_method !== undefined || expense.method !== undefined) {
        normalized.payment_method = normalizePaymentMethod(expense.payment_method ?? expense.method);
    }

    if (expense.status !== undefined) {
        normalized.status = normalizeExpenseStatus(expense.status);
    }

    if (expense.notes !== undefined) {
        normalized.notes = normalizeOptionalString(expense.notes, "notes");
    }

    if (expense.expense_date !== undefined || expense.date !== undefined) {
        normalized.expense_date = normalizeDate(expense.expense_date ?? expense.date, "expense_date");
    }

    if (expense.updated_at !== undefined) {
        normalized.updated_at = normalizeTimestamp(expense.updated_at);
    }

    return normalized;
}

function normalizeExpenseStatusToggle(value) {
    const data = assertPlainObject(value, "expense_status_toggle");

    return {
        id: normalizeId(data.id),
        status: normalizeExpenseStatus(data.status),
    };
}

function normalizeAmountByPaymentMethod(value, fieldName) {
    const data = assertPlainObject(value ?? {}, fieldName);
    const normalized = {};

    for (const method of PAYMENT_METHODS) {
        normalized[method] = normalizeNonNegativeAmount(data[method] ?? 0, `${fieldName}.${method}`);
    }

    return normalized;
}

function normalizeCashClosureForSave(value) {
    const closure = assertPlainObject(value, "cash_closure");
    const normalized = {
        close_date: normalizeDate(closure.close_date ?? closure.date, "close_date"),
        counted: normalizeAmountByPaymentMethod(closure.counted, "counted"),
        expected: normalizeAmountByPaymentMethod(closure.expected, "expected"),
        total_sales: normalizeNonNegativeAmount(closure.total_sales ?? 0, "total_sales"),
        total_paid_expenses: normalizeNonNegativeAmount(
            closure.total_paid_expenses ?? 0,
            "total_paid_expenses",
        ),
        total_pending_expenses: normalizeNonNegativeAmount(
            closure.total_pending_expenses ?? 0,
            "total_pending_expenses",
        ),
        net_profit: Number(closure.net_profit ?? 0),
        difference: Number(closure.difference ?? 0),
        operator_name: normalizeOptionalString(closure.operator_name, "operator_name", 80),
        notes: normalizeOptionalString(closure.notes, "notes"),
        status:
            closure.status === "open" || closure.status === "closed"
                ? closure.status
                : "closed",
        created_at: normalizeTimestamp(closure.created_at, "created_at"),
        updated_at: normalizeTimestamp(closure.updated_at),
    };

    if (!Number.isFinite(normalized.net_profit)) invalid("net_profit invalido");
    if (!Number.isFinite(normalized.difference)) invalid("difference invalido");

    if (closure.id !== undefined && closure.id !== null) {
        normalized.id = normalizeId(closure.id);
    }

    return normalized;
}

function normalizeProductForSave(value) {
    const product = assertPlainObject(value, "product");
    const normalized = {
        plu: normalizeString(product.plu, "plu", 24).replace(/\D/g, "").padStart(6, "0"),
        name: normalizeString(product.name, "name", MAX_SHORT_TEXT_LENGTH),
        price_per_kg:
            product.price_per_kg === undefined || product.price_per_kg === null || product.price_per_kg === ""
                ? 0
                : normalizeNonNegativeAmount(product.price_per_kg, "price_per_kg"),
        active: product.active === undefined ? true : normalizeBoolean(product.active, "active"),
        notes: normalizeOptionalString(product.notes, "notes"),
        // Campos extendidos del catalogo
        category: normalizeOptionalString(product.category, "category"),
        price:
            product.price === undefined || product.price === null || product.price === ""
                ? undefined
                : normalizeNonNegativeAmount(product.price, "price"),
        stock:
            product.stock === undefined || product.stock === null || product.stock === ""
                ? undefined
                : normalizeNonNegativeAmount(product.stock, "stock"),
        stock_min:
            product.stock_min === undefined || product.stock_min === null || product.stock_min === ""
                ? undefined
                : normalizeNonNegativeAmount(product.stock_min, "stock_min"),
        unit: normalizeOptionalString(product.unit, "unit"),
        created_at: normalizeTimestamp(product.created_at, "created_at"),
        updated_at: normalizeTimestamp(product.updated_at),
    };

    if (!/^\d{1,12}$/.test(normalized.plu)) {
        invalid("plu invalido");
    }

    if (product.id !== undefined && product.id !== null) {
        normalized.id = normalizeId(product.id);
    }

    return normalized;
}

function normalizeScannerConfig(value) {
    const config = assertPlainObject(value, "scanner_config");

    const barcodePrefix = normalizeString(
            config.barcode_prefix ?? DEFAULT_SCANNER_CONFIG.barcode_prefix,
            "barcode_prefix",
            4,
        ).replace(/\D/g, "");

    if (!barcodePrefix) {
        invalid("barcode_prefix debe tener al menos un numero");
    }

    const defaultPayment = config.default_payment_method ?? DEFAULT_SCANNER_CONFIG.default_payment_method;
    if (defaultPayment !== "" && !PAYMENT_METHODS.has(defaultPayment)) {
        invalid("default_payment_method invalido");
    }

    return {
        barcode_prefix: barcodePrefix,
        plu_start: normalizeInteger(
            config.plu_start ?? DEFAULT_SCANNER_CONFIG.plu_start,
            "plu_start",
            0,
            12,
        ),
        plu_length: normalizeInteger(
            config.plu_length ?? DEFAULT_SCANNER_CONFIG.plu_length,
            "plu_length",
            1,
            12,
        ),
        amount_start: normalizeInteger(
            config.amount_start ?? DEFAULT_SCANNER_CONFIG.amount_start,
            "amount_start",
            0,
            12,
        ),
        amount_length: normalizeInteger(
            config.amount_length ?? DEFAULT_SCANNER_CONFIG.amount_length,
            "amount_length",
            1,
            12,
        ),
        amount_divisor: normalizeInteger(
            config.amount_divisor ?? DEFAULT_SCANNER_CONFIG.amount_divisor,
            "amount_divisor",
            1,
            100000,
        ),
        auto_open_sale: config.auto_open_sale !== undefined
            ? normalizeBoolean(config.auto_open_sale, "auto_open_sale")
            : DEFAULT_SCANNER_CONFIG.auto_open_sale,
        bring_to_front: config.bring_to_front !== undefined
            ? normalizeBoolean(config.bring_to_front, "bring_to_front")
            : DEFAULT_SCANNER_CONFIG.bring_to_front,
        play_sound: config.play_sound !== undefined
            ? normalizeBoolean(config.play_sound, "play_sound")
            : DEFAULT_SCANNER_CONFIG.play_sound,
        default_payment_method: defaultPayment,
        max_char_interval: normalizeInteger(
            config.max_char_interval ?? DEFAULT_SCANNER_CONFIG.max_char_interval,
            "max_char_interval",
            10,
            2000,
        ),
        min_code_length: normalizeInteger(
            config.min_code_length ?? DEFAULT_SCANNER_CONFIG.min_code_length,
            "min_code_length",
            1,
            50,
        ),
        detect_truncated_amount: config.detect_truncated_amount !== undefined
            ? normalizeBoolean(config.detect_truncated_amount, "detect_truncated_amount")
            : DEFAULT_SCANNER_CONFIG.detect_truncated_amount,
    };
}

function normalizeAuditLog(value) {
    const log = assertPlainObject(value, "audit_log");

    return {
        id: log.id ? normalizeId(log.id) : undefined,
        action: normalizeString(log.action, "action", 80),
        entity: normalizeString(log.entity, "entity", 80),
        entity_id: normalizeOptionalString(log.entity_id, "entity_id", 128),
        description: normalizeOptionalString(log.description, "description", MAX_TEXT_LENGTH),
        created_at: normalizeTimestamp(log.created_at, "created_at"),
    };
}

function normalizeArray(value, fieldName, normalizer) {
    if (value === undefined || value === null) return [];

    if (!Array.isArray(value)) {
        invalid(`${fieldName} debe ser una lista`);
    }

    if (value.length > MAX_BACKUP_ITEMS) {
        invalid(`${fieldName} supera el maximo permitido`);
    }

    return value.map((item) => normalizer(item));
}

function normalizeBackupData(value) {
    const backup = assertPlainObject(value, "backup");

    if (
        backup.sales === undefined &&
        backup.expenses === undefined &&
        backup.cash_closures === undefined &&
        backup.products === undefined
    ) {
        invalid("backup sin datos restaurables");
    }

    return {
        sales: normalizeArray(backup.sales, "sales", normalizeSaleForCreate),
        expenses: normalizeArray(backup.expenses, "expenses", normalizeExpenseForCreate),
        cash_closures: normalizeArray(
            backup.cash_closures,
            "cash_closures",
            normalizeCashClosureForSave,
        ),
        products: normalizeArray(backup.products, "products", normalizeProductForSave),
        audit_logs: normalizeArray(backup.audit_logs, "audit_logs", normalizeAuditLog),
        scanner_config:
            backup.scanner_config && typeof backup.scanner_config === "object"
                ? normalizeScannerConfig(backup.scanner_config)
                : { ...DEFAULT_SCANNER_CONFIG },
    };
}

function normalizeDeleteUserDataRequest(value) {
    const data = assertPlainObject(value, "delete_user_data");
    const confirmPhrase = normalizeString(data.confirmPhrase, "confirmPhrase", 64);
    const deleteCloud = normalizeBoolean(data.deleteCloud, "deleteCloud");
    const deleteLocal = normalizeBoolean(data.deleteLocal, "deleteLocal");
    const requestRemoteLocal = normalizeBoolean(data.requestRemoteLocal, "requestRemoteLocal");

    if (confirmPhrase.toUpperCase() !== DATA_DELETE_CONFIRM_PHRASE) {
        invalid("confirmPhrase invalida");
    }

    if (!deleteCloud && !deleteLocal && !requestRemoteLocal) {
        invalid("Debe seleccionar al menos un destino de borrado");
    }

    return {
        userId: normalizeLicenseRecordId(data.userId),
        confirmEmail: normalizeEmail(data.confirmEmail),
        confirmPhrase,
        deleteCloud,
        deleteLocal,
        requestRemoteLocal,
    };
}

function normalizeDataWipeRunRequest(value) {
    const data = assertPlainObject(value, "data_wipe_run");

    return {
        userId: normalizeLicenseRecordId(data.userId),
    };
}

module.exports = {
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
    normalizeSaleForCreate,
    normalizeSaleForUpdate,
    normalizeSaleVoidToggle,
    normalizeScannerConfig,
};
