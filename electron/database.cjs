const { app } = require('electron');
const path = require('path');

// 📂 Ruta donde se guarda la DB
const dbPath = path.join(app.getPath('userData'), 'database.sqlite');

console.log("📂 DB PATH:", dbPath);

// 🔥 Crear conexión
const db = new Database(dbPath);

// =========================
// ⚙️ CONFIGURACIÓN (MEJORA)
// =========================
db.pragma('journal_mode = WAL'); // mejora rendimiento y evita corrupción

// =========================
// 🛒 TABLA VENTAS
// =========================
db.prepare(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_date TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    notes TEXT,
    voided INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// =========================
// 💰 TABLA GASTOS
// =========================
db.prepare(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date TEXT NOT NULL,
    concept TEXT NOT NULL,
    category TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

module.exports = db;