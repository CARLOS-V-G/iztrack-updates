/**
 * electron/config.cjs
 * Configuracion centralizada de Supabase para el proceso principal.
 *
 * En DESARROLLO: carga .env del root del proyecto (local Docker).
 * En PRODUCCION (build): usa las variables de entorno embebidas en .env.production
 *   por electron-builder, o los fallbacks hardcodeados al remoto.
 */

const path = require("path");

// Cargar .env en desarrollo (Node 20+ tiene process.loadEnvFile nativo)
// Solo cuando NO estamos en una build empaquetada
if (!process.env.npm_lifecycle_script) {
    try {
        const envPath = path.join(__dirname, "..", ".env");
        if (typeof process.loadEnvFile === "function") {
            process.loadEnvFile(envPath);
        }
    } catch {
        // Silencioso — en produccion el archivo puede no existir
    }
}

// ─── Supabase remoto (produccion) ───────────────────────────────────────────
const REMOTE_SUPABASE_URL = "https://fdnoudylvoyamsbwygdt.supabase.co";
const REMOTE_SUPABASE_ANON_KEY = "sb_publishable_Wz4Y-edWnLTubNlLJUw8jg_Nf5zv4kd";

// ─── Supabase local Docker (desarrollo) ─────────────────────────────────────
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Prioridad: variable de entorno → remoto (produccion)
const SUPABASE_URL = process.env.SUPABASE_URL || REMOTE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || REMOTE_SUPABASE_ANON_KEY;
const LICENSE_SECRET = process.env.LICENSE_SECRET || "iztrack-secret-key";
const ADMIN_HASH =
    process.env.ADMIN_HASH ||
    "$2b$10$4AgqlQ1ypkZrzri0hLTlje3m40KZvPAWppOLJsqbB4luiNWtiEWk6";

// Detectar si estamos en entorno de desarrollo
const IS_DEV =
    process.env.NODE_ENV === "development" ||
    process.env.SUPABASE_URL === LOCAL_SUPABASE_URL ||
    (!process.env.SUPABASE_URL && false); // produccion por defecto

module.exports = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    REMOTE_SUPABASE_URL,
    REMOTE_SUPABASE_ANON_KEY,
    LOCAL_SUPABASE_URL,
    LOCAL_SUPABASE_ANON_KEY,
    LICENSE_SECRET,
    ADMIN_HASH,
    IS_DEV,
};
