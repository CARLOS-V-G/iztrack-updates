const { createClient } = require("@supabase/supabase-js");
const { generarLicencia } = require("./electron/license.cjs");

const supabase = createClient(
    "https://fdnoudylvoyamsbwygdt.supabase.co",
    "sb_publishable_Wz4Y-edWnLTubNlLJUw8jg_Nf5zv4kd"
);

const email = process.argv[2];

if (!email) {
    console.log("❌ Tenés que pasar un email");
    console.log("📌 Uso: node generate-license.cjs usuario@email.com");
    process.exit(1);
}

(async () => {
    const safeEmail = email.trim().toLowerCase();

    // Una sola licencia por email
    const { data: existing } = await supabase
        .from("licenses")
        .select("id, license_key")
        .eq("email", safeEmail)
        .maybeSingle();

    if (existing) {
        console.log("\n✅ EL EMAIL YA TIENE LICENCIA");
        console.log("📧 Email:", safeEmail);
        console.log("🔑 Clave:", existing.license_key);
        process.exit(0);
    }

    const baseKey = generarLicencia(safeEmail);
    const uniqueKey = baseKey + "-" + Date.now().toString(36).toUpperCase();

    const { data, error } = await supabase
        .from("licenses")
        .insert([{ email: safeEmail, license_key: uniqueKey, active: true }])
        .select()
        .single();

    if (error) {
        console.log("❌ Error al guardar la licencia en Supabase:", error.message);
        process.exit(1);
    }

    console.log("\n✅ LICENCIA CREADA EN SUPABASE");
    console.log("📧 Email:", safeEmail);
    console.log("🔑 Clave:", uniqueKey);
    console.log("🆔 ID:", data.id);
})();