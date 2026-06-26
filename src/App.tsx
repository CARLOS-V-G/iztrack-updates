import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { SalesPage } from "./pages/SalesPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { CashClosurePage } from "./pages/CashClosurePage";
import { ReportsPage } from "./pages/ReportsPage";
import { ChartsPage } from "./pages/ChartsPage";
import { Page } from "./lib/types";
import LicenseScreen from "./components/LicenseScreen";
import AdminPanel from "./components/AdminPanel";
import AdminLogin from "./components/AdminLogin";
import { UpdateManager } from "./components/UpdateManager";
import { restoreBackup } from "./lib/cloudBackup";
import { syncData } from "./lib/cloudSync";
import { SettingsPage } from "./pages/SettingsPage";
import { MercadoPagoPage } from "./pages/MercadoPagoPage";
import { GmailPage } from "./pages/GmailPage";

type BackupSignatureRecord = {
  amount?: number;
  updated_at?: string;
  created_at?: string;
  sale_date?: string;
  expense_date?: string;
  close_date?: string;
  plu?: string;
};

function getBackupSignature(
  sales: BackupSignatureRecord[],
  expenses: BackupSignatureRecord[],
  cashClosures: BackupSignatureRecord[] = [],
  products: BackupSignatureRecord[] = [],
  scannerConfig: unknown = null,
) {
  const summarize = (items: BackupSignatureRecord[]) => {
    return items.reduce(
      (acc, item) => {
        const timestamp =
          item.updated_at ||
          item.created_at ||
          item.sale_date ||
          item.expense_date ||
          item.close_date ||
          item.plu ||
          "";

        return {
          count: acc.count + 1,
          total: acc.total + Number(item.amount || 0),
          latest: timestamp > acc.latest ? timestamp : acc.latest,
        };
      },
      { count: 0, total: 0, latest: "" },
    );
  };

  return JSON.stringify({
    sales: summarize(sales),
    expenses: summarize(expenses),
    cashClosures: summarize(cashClosures),
    products: summarize(products),
    scannerConfig,
  });
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [licensed, setLicensed] = useState<boolean | null>(null);

  // 🔥 SPLASH
  const [loadingApp, setLoadingApp] = useState(true);

  // 🔐 ADMIN
  const [adminMode, setAdminMode] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);

  // 🔥 ATAJO ADMIN
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        setAdminMode(true);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // 🔑 LICENCIA
  useEffect(() => {
    window.api.checkLicense().then((res) => {
      console.log("LICENCIA:", res);

      // 🔥 ahora es objeto
      if (typeof res === "boolean") {
        setLicensed(res);
      } else {
        setLicensed(res.valid);

        if (res.valid && res.userId) {
          localStorage.setItem("userId", res.userId);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!licensed) return;

    let cancelled = false;

    async function runPendingDataWipe() {
      const userId = localStorage.getItem("userId");
      if (!userId) return;

      const result = await window.api.runPendingDataWipe({ userId });

      if (cancelled || !result.ok || !result.wiped) return;

      localStorage.setItem("data_wipe_completed_at", new Date().toISOString());
      localStorage.removeItem("last_auto_backup_signature");
      location.reload();
    }

    runPendingDataWipe();
    const interval = setInterval(runPendingDataWipe, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [licensed]);

  useEffect(() => {
    if (!licensed) return;

    async function migrate() {
      const migrated = localStorage.getItem("backup_migrated");
      if (migrated) return;

      const userId = localStorage.getItem("userId");
      if (!userId) return;

      const sales = await window.api.getSales();
      const expenses = await window.api.getExpenses();

      if (sales.length === 0 && expenses.length === 0) return;

      const backup = await window.api.createBackup({
        userId,
        source: "migration",
      });

      if (!backup.ok) return;

      localStorage.setItem("backup_migrated", "true");

      console.log("🚀 DATOS MIGRADOS A LA NUBE");
    }

    migrate();
  }, [licensed]);

  useEffect(() => {
    if (!licensed) return;

    const interval = setInterval(
      async () => {
        const userId = localStorage.getItem("userId");
        if (!userId) return;

        const [sales, expenses, cashClosures, products, scannerConfig] = await Promise.all([
          window.api.getSales(),
          window.api.getExpenses(),
          window.api.getCashClosures(),
          window.api.getProducts(),
          window.api.getScannerConfig(),
        ]);
        const signature = getBackupSignature(
          sales,
          expenses,
          cashClosures,
          products,
          scannerConfig,
        );
        const previousSignature = localStorage.getItem("last_auto_backup_signature");

        if (signature === previousSignature) {
          localStorage.setItem("last_auto_backup_skipped_at", new Date().toISOString());
          await syncData(userId);
          return;
        }

        const backup = await window.api.createBackup({
          userId,
          source: "automatic",
        });

        if (backup.ok) {
          localStorage.setItem("last_auto_backup_signature", signature);
        }

        if (backup.ok && backup.cloudOk) {
          localStorage.setItem("last_auto_backup_at", new Date().toISOString());
          localStorage.removeItem("last_auto_backup_error");
        } else {
          if (backup.ok) {
            localStorage.setItem("last_auto_backup_local_at", new Date().toISOString());
          }
          localStorage.setItem(
            "last_auto_backup_error",
            backup.error || "No se pudo crear el backup automatico",
          );
        }

        console.log("☁️ Backup automático");
        await syncData(userId);
      },
      1000 * 60 * 5,
    ); // cada 5 min

    return () => clearInterval(interval);
  }, [licensed]);

  // ⏱️ SPLASH TIMER
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingApp(false);
    }, 3000); // podés poner 5000 si querés

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!licensed) return;

    async function restore() {
      const justRestored = localStorage.getItem("backup_restored");
      if (justRestored === "true") {
        localStorage.removeItem("backup_restored");
        return;
      }

      const userId = localStorage.getItem("userId");
      if (!userId) return;

      const localSales = await window.api.getSales();
      const localExpenses = await window.api.getExpenses();

      // 🔥 SOLO SI ESTÁ VACÍO
      if (localSales.length > 0 || localExpenses.length > 0) {
        return;
      }

      console.log("☁️ BUSCANDO BACKUP...");

      const data = await restoreBackup(userId);

      if (!data) return;

      const restored = await window.api.restoreData(
        data as unknown as Parameters<typeof window.api.restoreData>[0],
      );
      if (!restored) {
        console.error("No se pudo restaurar el backup en la base local");
        return;
      }

      localStorage.setItem("backup_restored", "true");

      console.log("🚀 RESTORE COMPLETO");
    }

    restore();
  }, [licensed]);

  // 🔐 LOGIN ADMIN
  if (adminMode && !adminAuth) {
    return (
      <>
        <AdminLogin onSuccess={() => setAdminAuth(true)} />
        <UpdateManager />
      </>
    );
  }

  // 🛠 PANEL ADMIN
  if (adminMode && adminAuth) {
    return (
      <>
        <AdminPanel
          onLogout={() => {
            setAdminAuth(false);
            setAdminMode(false);
          }}
        />
        <UpdateManager />
      </>
    );
  }

  // 🔥 SPLASH SCREEN
  if (loadingApp || licensed === null) {
    return (
      <div className="h-screen w-full bg-[#0b1b33] flex flex-col items-center justify-center relative">
        {/* LOGO */}
        <div className="mb-6 flex justify-center">
          <img
            src="../dist/logo.png"
            alt="izTrack"
            className="w-28 h-28 object-contain rounded-[8px] drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
          />
        </div>

        {/* NOMBRE */}
        <h1 className="text-white text-2xl font-semibold mb-10">izTrack</h1>

        {/* LOADER */}
        <div className="w-10 h-10 border-4 border-slate-400 border-t-transparent rounded-full animate-spin"></div>

        {/* COPYRIGHT */}
        <div className="absolute bottom-4 right-6 text-[10px] text-slate-400 text-right">
          © 2026 izTrack
          <br />
          Todos los derechos reservados
        </div>
      </div>
    );
  }

  // 🔒 BLOQUEO
  if (!licensed) {
    return (
      <>
        <LicenseScreen />
        <UpdateManager />
      </>
    );
  }

  // ✅ APP NORMAL
  const pages: Record<Page, JSX.Element> = {
    dashboard: <Dashboard />,
    sales: <SalesPage />,
    gmail: <div />,
    mercadopago: <div />,
    expenses: <ExpensesPage />,
    cash_closure: <CashClosurePage />,
    reports: <ReportsPage />,
    charts: <ChartsPage />,
    settings: <SettingsPage />,
  };

  return (
    <>
      <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
        {pages[currentPage]}
      </Layout>
      <UpdateManager />
      {["gmail", "mercadopago"].map((p) => (
        <div
          key={p}
          style={{
            position: "fixed", top: 0, left: 256, right: 0, bottom: 0,
            transform: currentPage === p ? "none" : "translateX(-9999px)",
            background: "#fff",
            zIndex: 10,
          }}
        >
          {p === "gmail" ? <GmailPage /> : <MercadoPagoPage />}
        </div>
      ))}
    </>
  );
}

export default App;
