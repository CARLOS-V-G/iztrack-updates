import { supabase } from "./supabase";
import {
    AuditLog,
    CashClosure,
    ExpenseStatus,
    PaymentMethod,
    Product,
    ScannerConfig,
} from "./types";

export type BackupSource = "manual" | "automatic" | "migration";

export type BackupData = {
    sales: BackupSale[];
    expenses: BackupExpense[];
    cash_closures?: CashClosure[];
    products?: Product[];
    audit_logs?: AuditLog[];
    scanner_config?: ScannerConfig;
    meta?: BackupMeta;
};

export type BackupMeta = {
    source: BackupSource;
    created_at: string;
    sales_count: number;
    expenses_count: number;
    cash_closures_count?: number;
    products_count?: number;
    app_version: string;
    format?: "json" | "gzip-base64";
    uncompressed_bytes?: number;
    compressed_bytes?: number;
};

export type CompressedBackupData = {
    format: "gzip-base64";
    payload: string;
    meta: BackupMeta;
};

export type BackupSale = {
    id?: string;
    sale_date: string;
    amount: number;
    payment_method: PaymentMethod;
    notes?: string;
    voided?: boolean;
    created_at?: string;
    updated_at?: string;
};

export type BackupExpense = {
    id?: string;
    expense_date: string;
    concept: string;
    category: string;
    amount: number;
    payment_method: PaymentMethod;
    status: ExpenseStatus;
    notes?: string;
    created_at?: string;
    updated_at?: string;
};

export type BackupRecord = {
    id: string;
    created_at: string;
    data?: StoredBackupData;
    source?: BackupSource | null;
    sales_count?: number | null;
    expenses_count?: number | null;
    cash_closures_count?: number | null;
    products_count?: number | null;
    compressed_bytes?: number | null;
    uncompressed_bytes?: number | null;
};

export type StoredBackupData = BackupData | CompressedBackupData;

export type BackupResult = {
    ok: boolean;
    backup?: BackupRecord;
    error?: string;
};

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;

    return "Error desconocido";
}

function byteLength(value: string) {
    return new TextEncoder().encode(value).length;
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

async function gzipText(value: string) {
    if (!("CompressionStream" in window)) {
        throw new Error("El entorno no soporta compresion de backups.");
    }

    const stream = new CompressionStream("gzip");
    const writer = stream.writable.getWriter();

    await writer.write(new TextEncoder().encode(value));
    await writer.close();

    const buffer = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(buffer);
}

async function gunzipText(bytes: Uint8Array) {
    if (!("DecompressionStream" in window)) {
        throw new Error("El entorno no soporta restaurar backups comprimidos.");
    }

    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();

    const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    await writer.write(buffer);
    await writer.close();

    return new Response(stream.readable).text();
}

function compactSale(sale: BackupSale): BackupSale {
    return {
        id: sale.id,
        sale_date: sale.sale_date,
        amount: Number(sale.amount || 0),
        payment_method: sale.payment_method,
        notes: sale.notes || "",
        voided: sale.voided ?? false,
        created_at: sale.created_at,
        updated_at: sale.updated_at,
    };
}

function compactExpense(expense: BackupExpense): BackupExpense {
    return {
        id: expense.id,
        expense_date: expense.expense_date,
        concept: expense.concept,
        category: expense.category || "",
        amount: Number(expense.amount || 0),
        payment_method: expense.payment_method,
        status: expense.status,
        notes: expense.notes || "",
        created_at: expense.created_at,
        updated_at: expense.updated_at,
    };
}

async function createStoredBackupData(data: Omit<BackupData, "meta">, source: BackupSource) {
    const meta: BackupMeta = {
        source,
        created_at: new Date().toISOString(),
        sales_count: data.sales.length,
        expenses_count: data.expenses.length,
        cash_closures_count: data.cash_closures?.length || 0,
        products_count: data.products?.length || 0,
        app_version: "1.0.0",
        format: "json",
    };
    const payload: BackupData = {
        sales: data.sales.map(compactSale),
        expenses: data.expenses.map(compactExpense),
        cash_closures: data.cash_closures || [],
        products: data.products || [],
        audit_logs: data.audit_logs || [],
        scanner_config: data.scanner_config,
        meta,
    };
    const json = JSON.stringify(payload);
    const compressed = await gzipText(json);
    const compressedPayload: CompressedBackupData = {
        format: "gzip-base64",
        payload: bytesToBase64(compressed),
        meta: {
            ...meta,
            format: "gzip-base64",
            uncompressed_bytes: byteLength(json),
            compressed_bytes: compressed.byteLength,
        },
    };

    return compressedPayload;
}

export async function decodeBackupData(data: StoredBackupData): Promise<BackupData> {
    if ("format" in data && data.format === "gzip-base64") {
        const json = await gunzipText(base64ToBytes(data.payload));
        return JSON.parse(json) as BackupData;
    }

    return data as BackupData;
}

export async function saveBackup(
    userId: string,
    data: Omit<BackupData, "meta">,
    source: BackupSource = "manual",
    companyId?: string,
    branchId?: string,
): Promise<BackupResult> {
    try {
        const payload = await createStoredBackupData(data, source);

        const { data: backup, error } = await supabase
            .from("backups")
            .insert([
                {
                    user_id: userId,
                    company_id: companyId || null,
                    branch_id: branchId || null,
                    data: payload,
                },
            ])
            .select("id, created_at")
            .single();

        if (error) {
            console.error("Error backup:", error);
            return { ok: false, error: error.message };
        }

        return { ok: true, backup: backup as BackupRecord };
    } catch (error) {
        return { ok: false, error: getErrorMessage(error) };
    }
}

export async function restoreBackup(userId: string) {
    const { data, error } = await supabase
        .from("backups")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        console.log("No hay backup para restaurar");
        return null;
    }

    return decodeBackupData(data.data as StoredBackupData);
}

export async function applyBackup(data: {
    sales: BackupSale[];
    expenses: BackupExpense[];
    cash_closures?: CashClosure[];
    products?: Product[];
    audit_logs?: AuditLog[];
    scanner_config?: ScannerConfig;
}) {
    for (const sale of data.sales) {
        await window.api.addSale({
            date: sale.sale_date,
            amount: sale.amount,
            method: sale.payment_method,
            notes: sale.notes,
        });
    }

    for (const exp of data.expenses) {
        await window.api.addExpense({
            date: exp.expense_date,
            concept: exp.concept,
            category: exp.category,
            amount: exp.amount,
            payment_method: exp.payment_method,
            status: exp.status,
            notes: exp.notes,
        });
    }

    if (data.cash_closures && data.cash_closures.length > 0) {
        for (const closure of data.cash_closures) {
            await window.api.saveCashClosure(closure);
        }
    }

    if (data.products && data.products.length > 0) {
        for (const product of data.products) {
            await window.api.saveProduct(product);
        }
    }

    if (data.scanner_config) {
        await window.api.saveScannerConfig(data.scanner_config);
    }
}

export { getErrorMessage };
