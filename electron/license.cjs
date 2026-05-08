const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SECRET = "iztrack-secret-key";

// ⚠️ IMPORTANTE: usá la ANON KEY real (no publishable fake)
const supabase = createClient(
    "https://fdnoudylvoyamsbwygdt.supabase.co",
    "sb_publishable_Wz4Y-edWnLTubNlLJUw8jg_Nf5zv4kd"
);

// =========================
// 🔑 GENERAR LICENCIA
// =========================
function generarLicencia(email) {
    const hash = crypto
        .createHmac("sha256", SECRET)
        .update(email)
        .digest("hex");

    return `IZ-${hash.substring(0, 16).toUpperCase()}`;
}

// =========================
// ☁️ GUARDAR EN LA NUBE
// =========================
async function guardarLicencia(email) {
    console.log("🔥 INTENTANDO GUARDAR:", email);

    const key = generarLicencia(email);

    const { data, error } = await supabase
        .from("licenses")
        .insert([
            {
                email,
                license_key: key,
                active: true,
            },
        ])
        .select()
        .single(); // 🔥 importante

    if (error) {
        console.log("❌ ERROR:", error);
        return null;
    }

    console.log("📦 LICENCIA CREADA:", data);

    return {
        key,
        userId: data.id, // 🔥 ya devolvemos el user_id
    };
}

// =========================
// 🔒 VALIDAR LICENCIA
// =========================
async function validarLicencia(email, key, deviceId) {
    try {
        // 1️⃣ validar formato local
        const licenciaValida = generarLicencia(email);
        if (licenciaValida !== key) {
            console.log("❌ Formato inválido");
            return { valid: false };
        }

        // 2️⃣ buscar en la nube
        const { data, error } = await supabase
            .from("licenses")
            .select("*")
            .eq("email", email)
            .eq("license_key", key)
            .single();

        if (error || !data) {
            console.log("❌ No existe en la nube");
            return { valid: false };
        }

        // 3️⃣ verificar estado
        if (!data.active) {
            console.log("⛔ Licencia desactivada");
            return { valid: false };
        }

        // 4️⃣ verificar dispositivo
        if (data.device_id && data.device_id !== deviceId) {
            console.log("🚫 Usada en otra PC");
            return { valid: false };
        }

        // 5️⃣ guardar primer uso (bind a PC)
        if (!data.device_id) {
            const { error: updateError } = await supabase
                .from("licenses")
                .update({ device_id: deviceId })
                .eq("id", data.id);

            if (updateError) {
                console.log("⚠️ Error guardando device_id:", updateError);
            } else {
                console.log("💻 Dispositivo registrado");
            }
        }

        console.log("✅ Licencia válida");

        return {
            valid: true,
            userId: data.id, // 🔥 CLAVE PARA BACKUP
            email: data.email, // 🔥 opcional útil
        };

    } catch (err) {
        console.log("🔥 ERROR VALIDANDO:", err);
        return { valid: false };
    }
}

module.exports = {
    generarLicencia,
    guardarLicencia,
    validarLicencia,
};