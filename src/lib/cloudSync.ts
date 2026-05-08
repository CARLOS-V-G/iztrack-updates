import { supabase } from "./supabase";

export async function syncData(userId: string) {
    console.log("🔄 SYNC INICIADO");

    const localSales = (await window.api.getSales()).map((s) => ({
        ...s,
        updated_at: s.updated_at || new Date().toISOString(),
    }));

    const { data: cloudSalesRaw } = await supabase
        .from("sales")
        .select("*")
        .eq("user_id", userId);

    const cloudSales = cloudSalesRaw || [];

    const localMap = new Map(localSales.map((s) => [s.id, s]));
    const cloudMap = new Map(cloudSales.map((s) => [s.id, s]));

    // 🔼 SUBIR
    for (const local of localSales) {
        const cloud = cloudMap.get(local.id);

        if (!cloud) {
            await supabase.from("sales").insert([
                {
                    ...local,
                    user_id: userId,
                },
            ]);
        } else if (
            local.updated_at &&
            cloud.updated_at &&
            new Date(local.updated_at) > new Date(cloud.updated_at)
        ) {
            await supabase
                .from("sales")
                .update(local)
                .eq("id", local.id);
        }
    }

    // 🔽 BAJAR
    for (const cloud of cloudSales) {
        const local = localMap.get(cloud.id);

        if (!local) {
            await window.api.addSale(cloud);
        } else if (
            cloud.updated_at &&
            local.updated_at &&
            new Date(cloud.updated_at) > new Date(local.updated_at)
        ) {
            await window.api.updateSale(cloud);
        }
    }

    // 🔽 BAJAR
    for (const cloud of cloudSales) {
        const local = localMap.get(cloud.id);

        if (!local) {
            await window.api.addSale(cloud);
        } else if (
            new Date(cloud.updated_at || 0) >
            new Date(cloud.updated_at)
        ) {
            await window.api.updateSale(cloud);
        }
    }

    console.log("✅ SYNC COMPLETO");
}