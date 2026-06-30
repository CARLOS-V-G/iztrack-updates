import {
  LayoutDashboard,
  ShoppingCart,
  Mail,
  Receipt,
  Calculator,
  FileBarChart2,
  TrendingUp,
  Settings,
  Globe,
  ChevronRight,
  ScanBarcode,
  Package,
} from "lucide-react";
import { Page } from "../lib/types";
import { useScannerStatus } from "../hooks/useScannerStatus";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

interface NavItem {
  page: Page;
  label: string;
  icon: typeof LayoutDashboard;
}

const primaryItems: NavItem[] = [
  { page: "dashboard", label: "Panel Principal", icon: LayoutDashboard },
  { page: "sales", label: "Ventas", icon: ShoppingCart },
  { page: "expenses", label: "Gastos", icon: Receipt },
  { page: "cash_closure", label: "Cierre de Caja", icon: Calculator },
  { page: "reports", label: "Reportes", icon: FileBarChart2 },
  { page: "charts", label: "Graficos", icon: TrendingUp },
];

const webviewItems: NavItem[] = [
  { page: "gmail", label: "Gmail", icon: Mail },
  { page: "mercadopago", label: "Mercado Pago", icon: Globe },
];

const settingsItem: NavItem = { page: "settings", label: "Configuracion", icon: Settings };

function NavButton({ item, currentPage, onNavigate }: { item: NavItem; currentPage: Page; onNavigate: (page: Page) => void }) {
  const Icon = item.icon;
  const active = currentPage === item.page;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.page)}
      className={`
        w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group
        ${active ? "bg-blue-600/15 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}
      `}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-blue-400 shadow-sm shadow-blue-400/50" />
      )}
      <div className={`flex items-center justify-center transition-all duration-200 ${active ? "scale-110" : "group-hover:scale-110"}`}>
        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      </div>
      <span className={`flex-1 text-left ${active ? "font-semibold" : ""}`}>{item.label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 text-blue-400/70" />}
    </button>
  );
}

const scannerDotColors = {
  green: "bg-green-400 shadow-green-400/30",
  amber: "bg-amber-400 shadow-amber-400/30",
  red: "bg-red-400 shadow-red-400/30",
  slate: "bg-slate-500",
};

const scannerBackendLabels: Record<string, string> = {
  powershell: "PS",
  "uiohook-napi": "HID",
  fallback: "basico",
  none: "--",
};

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const scanner = useScannerStatus(4000);

  return (
    <aside className="w-64 h-screen bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="px-5 py-6 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-slate-100 flex items-center justify-center shadow-lg shadow-black/20">
            <img
              src="./logo.png"
              alt="logo"
              className="w-full h-full object-cover rounded-lg scale-110"
            />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight tracking-tight">
              izTrack
            </p>
            <p className="text-slate-500 text-[11px] font-medium">Gestion Comercial</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <div className="space-y-0.5">
          {primaryItems.map((item) => (
            <NavButton key={item.page} item={item} currentPage={currentPage} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Webview separator */}
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="flex-1 h-px bg-slate-800/60" />
          <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Web</span>
          <span className="flex-1 h-px bg-slate-800/60" />
        </div>

        <div className="space-y-0.5">
          {webviewItems.map((item) => (
            <NavButton key={item.page} item={item} currentPage={currentPage} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Settings separator */}
        <div className="pt-2 mt-2 border-t border-slate-800/40">
          <NavButton item={settingsItem} currentPage={currentPage} onNavigate={onNavigate} />
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-800/60 space-y-2">
        {/* Scanner status */}
        <div className="bg-slate-800/20 rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ScanBarcode className={`w-3.5 h-3.5 flex-shrink-0 ${scanner.active ? "text-green-400" : "text-slate-600"}`} />
              <p className={`text-[11px] font-medium ${scanner.active ? "text-slate-300" : "text-slate-600"}`}>
                {scanner.label}
              </p>
            </div>
            {scanner.active && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-mono uppercase">
                {scannerBackendLabels[scanner.backend] ?? scanner.backend}
              </span>
            )}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 shadow-sm ${scannerDotColors[scanner.color]} ${scanner.active ? "animate-pulse" : ""}`} />
          </div>
        </div>

        {/* System info */}
        <div className="bg-slate-800/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/30 animate-pulse-soft" />
            <p className="text-slate-400 text-xs font-medium">Sistema activo</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-white text-xs font-medium">v{__APP_VERSION__}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">stable</span>
          </div>
          <p className="text-slate-500 text-[10px] mt-2 leading-tight">
            © 2026 izTrack · Todos los derechos reservados
          </p>
        </div>
      </div>
    </aside>
  );
}
