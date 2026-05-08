const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

// 📁 archivo
const adapter = new JSONFile("db.json");

// 🔥 IMPORTANTE: pasar default data acá
const db = new Low(adapter, {
    sales: [],
    expenses: [],
});

async function initDB() {
    await db.read();

    // por seguridad (si el archivo está vacío)
    db.data ||= {
        sales: [],
        expenses: [],
    };
    db.data.sales ||= [];
    db.data.expenses ||= [];

    await db.write();
}

module.exports = { db, initDB };
