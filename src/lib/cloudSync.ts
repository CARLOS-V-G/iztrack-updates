import { supabase } from "./supabase";
import { Expense, Sale, SecondaryProduct } from "./types";

type SyncRecord = {
    id: string;
    updated_at?: string;
    created_at?: string;
};

type SyncTableConfig<T extends SyncRecord> = {
    table: "sales" | "expenses" | "secondary_products";
    companyId: string;
    branchId: string;
    localItems: T[];
    toCloudRow: (item: T) => Record<string, unknown>;
    addLocal: (item: T) => Promise<unknown>;
    updateLocal: (item: T) => Promise<unknown>;
};

function getRecordTime(item?: SyncRecord) {
    return new Date(item?.updated_at || item?.created_at || 0).getTime();
}

async function syncTable<T extends SyncRecord>({
    table,
    companyId,
    branchId,
    localItems,
    toCloudRow,
    addLocal,
    updateLocal,
}: SyncTableConfig<T>) {
    const { data: cloudItemsRaw, error } = await supabase
        .from(table)
        .select("*")
        .eq("company_id", companyId)
        .eq("branch_id", branchId);

    if (error) {
        console.error(`No se pudo leer ${table} de Supabase:`, error.message);
        return;
    }

    const cloudItems = (cloudItemsRaw || []) as (T & { id: string; updated_at?: string; created_at?: string })[];
    const localMap = new Map(localItems.map((item) => [item.id, item]));
    const cloudMap = new Map(cloudItems.map((item) => [item.id, item]));

    for (const local of localItems) {
        const cloud = cloudMap.get(local.id);

        if (!cloud) {
            const payload = {
                ...toCloudRow(local),
                company_id: companyId,
                branch_id: branchId,
            };
            const { error: insertError } = await supabase.from(table).insert([payload]);
            if (insertError) {
                console.error(`No se pudo subir ${table}:`, insertError.message);
            }
            continue;
        }

        if (getRecordTime(local) > getRecordTime(cloud)) {
            const payload = {
                ...toCloudRow(local),
                company_id: companyId,
                branch_id: branchId,
            };
            const { error: updateError } = await supabase
                .from(table)
                .update(payload)
                .eq("id", local.id)
                .eq("company_id", companyId)
                .eq("branch_id", branchId);

            if (updateError) {
                console.error(`No se pudo actualizar ${table}:`, updateError.message);
            }
        }
    }

    for (const cloud of cloudItems) {
        const local = localMap.get(cloud.id);
        if (!local) {
            await addLocal(withoutExtraFields(cloud));
            continue;
        }
        if (getRecordTime(cloud) > getRecordTime(local)) {
            await updateLocal(withoutExtraFields(cloud));
        }
    }
}

function withoutExtraFields(item: any) {
    const { company_id, branch_id, ...rest } = item;
    return rest;
}

function saleToCloud(sale: Sale) {
    return {
        id: sale.id,
        sale_date: sale.sale_date,
        amount: sale.amount,
        payment_method: sale.payment_method,
        notes: sale.notes || null,
        voided: sale.voided,
        created_at: sale.created_at,
        updated_at: sale.updated_at,
    };
}

function expenseToCloud(expense: Expense) {
    return {
        id: expense.id,
        expense_date: expense.expense_date,
        amount: expense.amount,
        concept: expense.concept,
        category: expense.category,
        payment_method: expense.payment_method,
        status: expense.status,
        notes: expense.notes || null,
        created_at: expense.created_at,
        updated_at: expense.updated_at,
    };
}

function secondaryProductToCloud(product: SecondaryProduct) {
    return {
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        category: product.category || null,
        active: product.active,
        created_at: product.created_at,
        updated_at: product.updated_at,
    };
}

export async function syncData(companyId: string, branchId: string) {
    console.log("SYNC INICIADO");

    const [localSales, localExpenses] = await Promise.all([
        window.api.getSales(),
        window.api.getExpenses(),
    ]);

    await syncTable<Sale>({
        table: "sales",
        companyId,
        branchId,
        localItems: localSales,
        toCloudRow: saleToCloud,
        addLocal: (sale) => window.api.addSale(sale),
        updateLocal: (sale) => window.api.updateSale(sale),
    });

    await syncTable<Expense>({
        table: "expenses",
        companyId,
        branchId,
        localItems: localExpenses,
        toCloudRow: expenseToCloud,
        addLocal: (expense) => window.api.addExpense(expense),
        updateLocal: (expense) => window.api.updateExpense(expense),
    });

    const localSecondary = await window.api.getSecondaryProducts();
    await syncTable<SecondaryProduct>({
        table: "secondary_products",
        companyId,
        branchId,
        localItems: localSecondary,
        toCloudRow: secondaryProductToCloud,
        addLocal: (item) => window.api.saveSecondaryProduct(item),
        updateLocal: (item) => window.api.saveSecondaryProduct(item),
    });

    console.log("SYNC COMPLETO");
}
