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

    if (backup.sales === undefined && backup.expenses === undefined) {
        invalid("backup sin datos restaurables");
    }

    return {
        sales: normalizeArray(backup.sales, "sales", normalizeSaleForCreate),
        expenses: normalizeArray(backup.expenses, "expenses", normalizeExpenseForCreate),
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
};
