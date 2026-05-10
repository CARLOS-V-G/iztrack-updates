import { supabase } from "./supabase";
import { Expense, Sale } from "./types";

type SyncRecord = {
    id: string;
    updated_at?: string;
    created_at?: string;
};

type SyncTableConfig<T extends SyncRecord> = {
    table: "sales" | "expenses";
    userId: string;
    localItems: T[];
    addLocal: (item: T) => Promise<unknown>;
    updateLocal: (item: T) => Promise<unknown>;
};

function withUpdatedAt<T extends SyncRecord>(item: T): T {
    return {
        ...item,
        updated_at:
            item.updated_at ||
            item.created_at ||
            new Date().toISOString(),
    };
}

function getRecordTime(item?: SyncRecord) {
    return new Date(item?.updated_at || item?.created_at || 0).getTime();
}

function withoutCloudOnlyFields<T extends SyncRecord>(item: T): T {
    const copy = { ...(item as T & { user_id?: unknown }) };
    delete copy.user_id;

    return copy as T;
}

async function syncTable<T extends SyncRecord>({
    table,
    userId,
    localItems,
    addLocal,
    updateLocal,
}: SyncTableConfig<T>) {
    const normalizedLocal = localItems.map(withUpdatedAt);

    const { data: cloudItemsRaw, error } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", userId);

    if (error) {
        console.error(`No se pudo leer ${table} de Supabase:`, error.message);
        return;
    }

    const cloudItems = ((cloudItemsRaw || []) as T[]).map(withUpdatedAt);
    const localMap = new Map(normalizedLocal.map((item) => [item.id, item]));
    const cloudMap = new Map(cloudItems.map((item) => [item.id, item]));

    for (const local of normalizedLocal) {
        const cloud = cloudMap.get(local.id);
        const payload = {
            ...withoutCloudOnlyFields(local),
            user_id: userId,
        };

        if (!cloud) {
            const { error: insertError } = await supabase.from(table).insert([payload]);
            if (insertError) {
                console.error(`No se pudo subir ${table}:`, insertError.message);
            }
            continue;
        }

        if (getRecordTime(local) > getRecordTime(cloud)) {
            const { error: updateError } = await supabase
                .from(table)
                .update(payload)
                .eq("id", local.id)
                .eq("user_id", userId);

            if (updateError) {
                console.error(`No se pudo actualizar ${table}:`, updateError.message);
            }
        }
    }

    for (const cloud of cloudItems) {
        const local = localMap.get(cloud.id);
        const localPayload = withoutCloudOnlyFields(cloud);

        if (!local) {
            await addLocal(localPayload);
            continue;
        }

        if (getRecordTime(cloud) > getRecordTime(local)) {
            await updateLocal(localPayload);
        }
    }
}

export async function syncData(userId: string) {
    console.log("SYNC INICIADO");

    const [localSales, localExpenses] = await Promise.all([
        window.api.getSales(),
        window.api.getExpenses(),
    ]);

    await syncTable<Sale>({
        table: "sales",
        userId,
        localItems: localSales,
        addLocal: (sale) => window.api.addSale(sale),
        updateLocal: (sale) => window.api.updateSale(sale),
    });

    await syncTable<Expense>({
        table: "expenses",
        userId,
        localItems: localExpenses,
        addLocal: (expense) => window.api.addExpense(expense),
        updateLocal: (expense) => window.api.updateExpense(expense),
    });

    console.log("SYNC COMPLETO");
}
