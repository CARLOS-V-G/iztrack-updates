const { generarLicencia } = require('./electron/license.cjs');

const email = process.argv[2];

if (!email) {
    console.log("❌ Tenés que pasar un email");
    process.exit(1);
}

const key = generarLicencia(email);

console.log("\n✅ LICENCIA GENERADA");
console.log("📧 Email:", email);
console.log("🔑 Clave:", key);