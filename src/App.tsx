import { lazy, Suspense, useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { Page } from "./lib/types";
import LicenseScreen from "./components/LicenseScreen";
import AdminPanel from "./components/AdminPanel";
import AdminLogin from "./components/AdminLogin";
import { UpdateManager } from "./components/UpdateManager";
import { restoreBackup } from "./lib/cloudBackup";
import { syncData } from "./lib/cloudSync";

const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const SalesPage = lazy(() => import("./pages/SalesPage").then(m => ({ default: m.SalesPage })));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage").then(m => ({ default: m.ExpensesPage })));
const CashClosurePage = lazy(() => import("./pages/CashClosurePage").then(m => ({ default: m.CashClosurePage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then(m => ({ default: m.ReportsPage })));
const ChartsPage = lazy(() => import("./pages/ChartsPage").then(m => ({ default: m.ChartsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const GmailPage = lazy(() => import("./pages/GmailPage").then(m => ({ default: m.GmailPage })));
const MercadoPagoPage = lazy(() => import("./pages/MercadoPagoPage").then(m => ({ default: m.MercadoPagoPage })));
const SecondaryProductsPage = lazy(() => import("./pages/SecondaryProductsPage").then(m => ({ default: m.SecondaryProductsPage })));

const CONTENT_PAGES: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: Dashboard,
  sales: SalesPage,
  expenses: ExpensesPage,
  cash_closure: CashClosurePage,
  reports: ReportsPage,
  charts: ChartsPage,
  settings: SettingsPage,
  secondary_products: SecondaryProductsPage,
};

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

  // SPLASH
  const [loadingApp, setLoadingApp] = useState(true);

  // ADMIN
  const [adminMode, setAdminMode] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);

  // ATAJO ADMIN
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        setAdminMode(true);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // LICENCIA
  useEffect(() => {
    window.api.checkLicense().then((res) => {
      if (typeof res === "boolean") {
        setLicensed(res);
      } else {
        setLicensed(res.valid);

        if (res.valid && res.userId) {
          localStorage.setItem("userId", res.userId);
        }
        if (res.valid && res.companyId) {
          localStorage.setItem("companyId", res.companyId);
        }
        if (res.valid && res.branchId) {
          localStorage.setItem("branchId", res.branchId);
        }
      }
    });
  }, []);

  // DATA WIPE REMOTO
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

  // MIGRACION INICIAL A LA NUBE
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
        companyId: localStorage.getItem("companyId"),
        branchId: localStorage.getItem("branchId"),
        source: "migration",
      });

      if (backup.ok) {
        localStorage.setItem("backup_migrated", "true");
      }
    }

    migrate();
  }, [licensed]);

  // BACKUP AUTOMATICO CADA 5 MINUTOS
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
          const cId = localStorage.getItem("companyId");
          const bId = localStorage.getItem("branchId");
          if (cId && bId) await syncData(cId, bId);
          return;
        }

        const backup = await window.api.createBackup({
          userId,
          companyId: localStorage.getItem("companyId"),
          branchId: localStorage.getItem("branchId"),
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

        const cId = localStorage.getItem("companyId");
        const bId = localStorage.getItem("branchId");
        if (cId && bId) await syncData(cId, bId);
      },
      1000 * 60 * 5,
    );

    return () => clearInterval(interval);
  }, [licensed]);

  // SPLASH TIMER
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingApp(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // RESTAURAR DESDE NUBE SI DB LOCAL VACIA
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

      // Solo restaurar si la DB local esta vacia
      if (localSales.length > 0 || localExpenses.length > 0) {
        return;
      }

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
    }

    restore();
  }, [licensed]);

  // LOGIN ADMIN
  if (adminMode && !adminAuth) {
    return (
      <>
        <AdminLogin onSuccess={() => setAdminAuth(true)} />
        <UpdateManager />
      </>
    );
  }

  // PANEL ADMIN
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

  // SPLASH SCREEN
  if (loadingApp || licensed === null) {
    return (
      <div className="h-screen w-full bg-[#0b1b33] flex flex-col items-center justify-center relative">
        <div className="mb-6 flex justify-center">
          <img
            src="./logo.png"
            alt="izTrack"
            className="w-28 h-28 object-contain rounded-[8px] drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
          />
        </div>

        <h1 className="text-white text-2xl font-semibold mb-10">izTrack</h1>

        <div className="w-10 h-10 border-4 border-slate-400 border-t-transparent rounded-full animate-spin"></div>

        <div className="absolute bottom-4 right-6 text-[10px] text-slate-400 text-right">
          © 2026 izTrack
          <br />
          Todos los derechos reservados
        </div>
      </div>
    );
  }

  // BLOQUEO POR LICENCIA
  if (!licensed) {
    return (
      <>
        <LicenseScreen />
        <UpdateManager />
      </>
    );
  }

  // APP NORMAL
  const PageComponent = CONTENT_PAGES[currentPage];

  return (
    <>
      <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-400 text-sm animate-pulse">Cargando...</div>}>
          {PageComponent ? <PageComponent /> : <div />}
        </Suspense>
      </Layout>
      <UpdateManager />
      {currentPage === "gmail" && (
        <div style={{ position: "fixed", top: 0, left: 256, right: 0, bottom: 0, background: "#fff", zIndex: 10 }}>
          <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>}>
            <GmailPage />
          </Suspense>
        </div>
      )}
      {currentPage === "mercadopago" && (
        <div style={{ position: "fixed", top: 0, left: 256, right: 0, bottom: 0, background: "#fff", zIndex: 10 }}>
          <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>}>
            <MercadoPagoPage />
          </Suspense>
        </div>
      )}
    </>
  );
}

export default App;
