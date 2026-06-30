const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// Config centralizado (carga .env automaticamente en dev)
const config = require("./config.cjs");
const SECRET = config.LICENSE_SECRET;
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

// =========================
// GENERAR LICENCIA
// =========================
function generarLicencia(email) {
    const hash = crypto
        .createHmac("sha256", SECRET)
        .update(email)
        .digest("hex");

    return `IZ-${hash.substring(0, 16).toUpperCase()}`;
}

// =========================
// GUARDAR EN LA NUBE
// =========================
async function guardarLicencia(email) {
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
        .single();

    if (error) {
        return null;
    }

    return {
        key,
        userId: data.id,
    };
}

// =========================
// VALIDAR LICENCIA
// =========================
async function validarLicencia(email, key, deviceId) {
    try {
        // 1. Validar formato local
        const licenciaValida = generarLicencia(email);
        if (licenciaValida !== key) {
            return { valid: false };
        }

        // 2. Buscar en la nube
        const { data, error } = await supabase
            .from("licenses")
            .select("*")
            .eq("email", email)
            .eq("license_key", key)
            .single();

        if (error || !data) {
            return { valid: false };
        }

        // 3. Verificar estado
        if (!data.active) {
            return { valid: false };
        }

        // 4. Verificar dispositivo
        if (data.device_id && data.device_id !== deviceId) {
            return { valid: false };
        }

        // 5. Guardar primer uso (bind a PC)
        if (!data.device_id) {
            await supabase
                .from("licenses")
                .update({ device_id: deviceId })
                .eq("id", data.id);
        }

        return {
            valid: true,
            userId: data.id,
            companyId: data.company_id,
            branchId: data.branch_id,
            email: data.email,
        };

    } catch {
        return { valid: false };
    }
}

module.exports = {
    generarLicencia,
    guardarLicencia,
    validarLicencia,
};