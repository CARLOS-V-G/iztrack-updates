import { useCallback, useEffect, useState } from "react";

export type ScannerBackend = "powershell" | "uiohook-napi" | "fallback" | "none";

export type ScannerStatusInfo = {
    backend: ScannerBackend;
    active: boolean;
    label: string;
    color: "green" | "amber" | "red" | "slate";
};

function getStatusInfo(backend: ScannerBackend, active: boolean): ScannerStatusInfo {
    if (!active || backend === "none") {
        return { backend, active: false, label: "Scanner inactivo", color: "slate" };
    }
    if (backend === "powershell") {
        return { backend, active: true, label: "Scanner activo", color: "green" };
    }
    if (backend === "uiohook-napi") {
        return { backend, active: true, label: "Scanner activo", color: "green" };
    }
    if (backend === "fallback") {
        return { backend, active: true, label: "Scanner (modo basico)", color: "amber" };
    }
    return { backend: "none", active: false, label: "Scanner inactivo", color: "slate" };
}

export function useScannerStatus(pollMs = 4000): ScannerStatusInfo {
    const [info, setInfo] = useState<ScannerStatusInfo>({
        backend: "none",
        active: false,
        label: "Scanner inactivo",
        color: "slate",
    });

    const poll = useCallback(async () => {
        try {
            const status = await window.api.getScannerStatus();
            setInfo(getStatusInfo(status.backend as ScannerBackend, status.active));
        } catch {
            // Silencioso — el IPC puede no estar disponible en dev sin Electron
        }
    }, []);

    useEffect(() => {
        poll();
        const interval = setInterval(poll, pollMs);
        return () => clearInterval(interval);
    }, [poll, pollMs]);

    return info;
}
