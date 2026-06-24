const { app } = require("electron");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

const DEFAULT_DATA = {
    sales: [],
    expenses: [],
    cash_closures: [],
    products: [],
    audit_logs: [],
    scanner_config: {
        barcode_prefix: "2",
        plu_start: 1,
        plu_length: 5,
        amount_start: 6,
        amount_length: 6,
        amount_divisor: 1,
    },
};

const dbPath = path.join(app.getPath("userData"), "db.json");
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, cloneDefaultData());

function cloneDefaultData() {
    return {
        sales: [],
        expenses: [],
        cash_closures: [],
        products: [],
        audit_logs: [],
        scanner_config: { ...DEFAULT_DATA.scanner_config },
    };
}

function normalizeDataShape(data) {
    return {
        sales: Array.isArray(data?.sales) ? data.sales : [],
        expenses: Array.isArray(data?.expenses) ? data.expenses : [],
        cash_closures: Array.isArray(data?.cash_closures) ? data.cash_closures : [],
        products: Array.isArray(data?.products) ? data.products : [],
        audit_logs: Array.isArray(data?.audit_logs) ? data.audit_logs : [],
        scanner_config:
            data?.scanner_config && typeof data.scanner_config === "object"
                ? { ...DEFAULT_DATA.scanner_config, ...data.scanner_config }
                : { ...DEFAULT_DATA.scanner_config },
    };
}

function countRecords(data) {
    return (
        (data.sales?.length || 0) +
        (data.expenses?.length || 0) +
        (data.cash_closures?.length || 0) +
        (data.products?.length || 0) +
        (data.audit_logs?.length || 0)
    );
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

function normalizeRecords(records, dateFields) {
    return (records || []).map((record) => normalizeRecord(record, dateFields));
}

function mergeRecords(currentRecords, incomingRecords, dateFields) {
    const mergedRecords = normalizeRecords(currentRecords, dateFields);
    const firstIndexById = new Map();

    mergedRecords.forEach((record, index) => {
        if (!firstIndexById.has(record.id)) {
            firstIndexById.set(record.id, index);
        }
    });

    for (const record of incomingRecords || []) {
        const normalized = normalizeRecord(record, dateFields);
        const existingIndex = firstIndexById.get(normalized.id);

        if (existingIndex === undefined) {
            firstIndexById.set(normalized.id, mergedRecords.length);
            mergedRecords.push(normalized);
            continue;
        }

        const existing = mergedRecords[existingIndex];
        const incomingTimestamp = getRecordTimestamp(normalized, dateFields);
        const existingTimestamp = getRecordTimestamp(existing, dateFields);

        if (incomingTimestamp > existingTimestamp) {
            mergedRecords[existingIndex] = {
                ...existing,
                ...normalized,
            };
        }
    }

    return mergedRecords;
}

function mergeData(currentData, incomingData) {
    return {
        sales: mergeRecords(currentData.sales, incomingData.sales, ["sale_date"]),
        expenses: mergeRecords(currentData.expenses, incomingData.expenses, [
            "expense_date",
        ]),
        cash_closures: mergeRecords(
            currentData.cash_closures,
            incomingData.cash_closures,
            ["close_date"],
        ),
        products: mergeRecords(currentData.products, incomingData.products, ["plu"]),
        audit_logs: mergeRecords(currentData.audit_logs, incomingData.audit_logs, [
            "created_at",
        ]),
        scanner_config: {
            ...DEFAULT_DATA.scanner_config,
            ...(incomingData.scanner_config || {}),
            ...(currentData.scanner_config || {}),
        },
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
