const { app } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

const DEFAULT_DATA = {
    sales: [],
    expenses: [],
};

const dbPath = path.join(app.getPath("userData"), "db.json");
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, cloneDefaultData());

function cloneDefaultData() {
    return {
        sales: [],
        expenses: [],
    };
}

function normalizeDataShape(data) {
    return {
        sales: Array.isArray(data?.sales) ? data.sales : [],
        expenses: Array.isArray(data?.expenses) ? data.expenses : [],
    };
}

function countRecords(data) {
    return (data.sales?.length || 0) + (data.expenses?.length || 0);
}

function readJsonData(filePath) {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        if (!raw.trim()) return cloneDefaultData();

        return normalizeDataShape(JSON.parse(raw));
    } catch (err) {
        console.warn(`No se pudo leer DB legacy: ${filePath}`, err.message);
        return null;
    }
}

function getRecordTimestamp(record, dateFields) {
    for (const field of ["updated_at", "created_at", ...dateFields]) {
        const value = record?.[field];
        if (value) return String(value);
    }

    return "";
}

function normalizeRecord(record, dateFields) {
    const normalized = { ...record };

    if (!normalized.id) {
        normalized.id = randomUUID();
    }

    if (!normalized.updated_at) {
        normalized.updated_at =
            getRecordTimestamp(normalized, dateFields) || new Date().toISOString();
    }

    return normalized;
}

function mergeRecords(currentRecords, incomingRecords, dateFields) {
    const recordsById = new Map();

    for (const record of currentRecords || []) {
        const normalized = normalizeRecord(record, dateFields);
        recordsById.set(normalized.id, normalized);
    }

    for (const record of incomingRecords || []) {
        const normalized = normalizeRecord(record, dateFields);
        const existing = recordsById.get(normalized.id);

        if (!existing) {
            recordsById.set(normalized.id, normalized);
            continue;
        }

        const incomingTimestamp = getRecordTimestamp(normalized, dateFields);
        const existingTimestamp = getRecordTimestamp(existing, dateFields);

        if (incomingTimestamp > existingTimestamp) {
            recordsById.set(normalized.id, {
                ...existing,
                ...normalized,
            });
        }
    }

    return Array.from(recordsById.values());
}

function mergeData(currentData, incomingData) {
    return {
        sales: mergeRecords(currentData.sales, incomingData.sales, ["sale_date"]),
        expenses: mergeRecords(currentData.expenses, incomingData.expenses, [
            "expense_date",
        ]),
    };
}

function getLegacyDbCandidates() {
    const candidates = [
        path.resolve(process.cwd(), "db.json"),
        path.join(path.dirname(process.execPath), "db.json"),
        path.join(path.dirname(app.getPath("exe")), "db.json"),
        path.join(app.getAppPath(), "db.json"),
    ];

    if (typeof process.resourcesPath === "string") {
        candidates.push(
            path.join(process.resourcesPath, "db.json"),
            path.join(process.resourcesPath, "app", "db.json"),
        );
    }

    const target = path.resolve(dbPath).toLowerCase();
    const seen = new Set();

    return candidates
        .map((candidate) => path.resolve(candidate))
        .filter((candidate) => {
            const key = candidate.toLowerCase();
            if (key === target || seen.has(key)) return false;
            seen.add(key);
            return fs.existsSync(candidate);
        });
}

function migrateLegacyDatabaseIfNeeded() {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    let targetData = fs.existsSync(dbPath)
        ? readJsonData(dbPath) || cloneDefaultData()
        : cloneDefaultData();
    const beforeCount = countRecords(targetData);
    const migratedFrom = [];

    for (const candidate of getLegacyDbCandidates()) {
        const legacyData = readJsonData(candidate);
        if (!legacyData || countRecords(legacyData) === 0) continue;

        targetData = mergeData(targetData, legacyData);
        migratedFrom.push(candidate);
    }

    const afterCount = countRecords(targetData);

    if (!fs.existsSync(dbPath) || migratedFrom.length > 0 || afterCount !== beforeCount) {
        fs.writeFileSync(dbPath, JSON.stringify(targetData, null, 2), "utf8");
    }

    if (migratedFrom.length > 0) {
        console.log("DB migrada a userData:", {
            dbPath,
            records: afterCount,
            migratedFrom,
        });
    } else {
        console.log("DB PATH:", dbPath);
    }
}

async function initDB() {
    migrateLegacyDatabaseIfNeeded();

    await db.read();

    db.data ||= cloneDefaultData();
    db.data = mergeData(normalizeDataShape(db.data), DEFAULT_DATA);

    await db.write();
}

module.exports = { db, initDB, dbPath };
