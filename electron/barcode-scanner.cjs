const { spawn } = require("child_process");
const path = require("path");

let appPath;
try {
    const { app } = require("electron");
    appPath = app.getAppPath();
} catch {
    appPath = __dirname;
}

const DEFAULTS = {
    maxCharInterval: 50,
    minCodeLength: 3,
    maxCodeLength: 32,
};

let backendName = "none";
let cleanup = null;
let barcodeCallback = null;
let active = false;

let buf = "";
let lastTime = 0;

function log(...args) {
    try { console.log("[barcode-scanner]", ...args); } catch { }
}

function vkToChar(vk) {
    if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk - 0x30 + 48);
    if (vk >= 0x60 && vk <= 0x69) return String.fromCharCode(vk - 0x60 + 48);
    if (vk === 0x0D || vk === 0x0A) return "\r";
    if (vk === 0x09) return "\t";
    if (vk === 0x08) return "\b";
    if (vk >= 0x41 && vk <= 0x5A) return String.fromCharCode(vk - 0x41 + 97);
    if (vk === 0x6E) return ".";
    if (vk === 0x6B || vk === 0xBB) return "+";
    if (vk === 0x6D || vk === 0xBD) return "-";
    return "";
}

function pushKey(vkCode) {
    if (!barcodeCallback) return;
    const now = Date.now();
    if (lastTime > 0 && now - lastTime > DEFAULTS.maxCharInterval) {
        buf = "";
    }
    lastTime = now;
    const ch = vkToChar(vkCode);
    if (vkCode === 0x0D) {
        const code = buf.trim();
        buf = "";
        if (code.length >= DEFAULTS.minCodeLength) {
            barcodeCallback(code);
        }
        return;
    }
    if (vkCode === 0x08) { buf = buf.slice(0, -1); return; }
    if (vkCode === 0x09) {
        const code = buf.trim();
        buf = "";
        if (code.length >= DEFAULTS.minCodeLength) barcodeCallback(code);
        return;
    }
    if (/^\d$/.test(ch)) {
        buf = (buf + ch).slice(-DEFAULTS.maxCodeLength);
    }
}

// --- Backend: PowerShell global hook ---
function tryPowerShell(callback, hwnd) {
    try {
        const psPath = path.join(appPath, "electron", "global-hook.ps1");
        log("starting PowerShell hook, hwnd=" + hwnd);
        const child = spawn(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath, "-hwnd", String(hwnd)],
            { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
        );

        child.stdout.on("data", (data) => {
            const text = data.toString("utf8");
            const lines = text.split("\n").filter(Boolean);
            for (const line of lines) {
                if (line === "HOOK_READY") continue;
                const vk = parseInt(line, 10);
                if (!isNaN(vk)) pushKey(vk);
            }
        });

        child.stderr.on("data", (data) => {
            log("PS stderr:", data.toString("utf8").trim());
        });

        child.on("error", (err) => {
            log("PS spawn error:", err.message);
        });

        child.on("exit", (code) => {
            log("PS exited with code:", code);
        });

        backendName = "powershell";
        log("PowerShell hook started");
        return () => {
            try { child.kill(); } catch { }
        };
    } catch (err) {
        log("PowerShell hook error:", err.message);
        return null;
    }
}

// --- Backend: uiohook-napi ---
function tryUiohook(callback) {
    try {
        const uiohook = require("uiohook-napi");
        uiohook.uIOhook.on("keydown", (e) => {
            if (e && (e.altKey || e.ctrlKey || e.metaKey)) return;
            pushKey(e.keycode);
        });
        uiohook.uIOhook.start();
        backendName = "uiohook-napi";
        log("uiohook-napi started");
        return () => {
            try { uiohook.uIOhook.stop(); } catch { }
        };
    } catch (err) {
        log("uiohook-napi error:", err.message);
        return null;
    }
}

function tryIntervalFallback() {
    backendName = "fallback";
    return () => { };
}

// --- Public API ---
function start(callback, hwnd) {
    if (active) return true;
    active = true;
    barcodeCallback = callback;
    buf = "";
    lastTime = 0;

    let doCleanup;

    doCleanup = tryPowerShell(callback, hwnd);
    if (doCleanup) { cleanup = doCleanup; log("backend: powershell"); return true; }

    doCleanup = tryUiohook(callback);
    if (doCleanup) { cleanup = doCleanup; log("backend: uiohook-napi"); return true; }

    doCleanup = tryIntervalFallback();
    if (doCleanup) { cleanup = doCleanup; log("backend: fallback"); return true; }

    active = false;
    return false;
}

function stop() {
    if (!active) return;
    active = false;
    barcodeCallback = null;
    if (cleanup) {
        cleanup();
        cleanup = null;
    }
    buf = "";
    lastTime = 0;
    log("stopped");
}

function getBackendName() { return backendName; }
function isActive() { return active; }

module.exports = { start, stop, getBackendName, isActive };
