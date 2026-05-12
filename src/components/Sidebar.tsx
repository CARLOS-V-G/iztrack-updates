import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Calculator,
  FileBarChart2,
  TrendingUp,
  Settings, // 🔥 AGREGAR
} from "lucide-react";
import { Page } from "../lib/types";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: Array<{
  page: Page;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { page: "dashboard", label: "Panel Principal", icon: LayoutDashboard },
  { page: "sales", label: "Ventas", icon: ShoppingCart },
  { page: "expenses", label: "Gastos", icon: Receipt },
  { page: "cash_closure", label: "Cierre de Caja", icon: Calculator },
  { page: "reports", label: "Reportes", icon: FileBarChart2 },
  { page: "charts", label: "Gráficos", icon: TrendingUp },
  { page: "settings", label: "Configuración", icon: Settings }, // 🔥 NUEVO
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-64 min-h-screen bg-slate-900 flex flex-col flex-shrink-0">
      <div className="px-6 py-7 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
            <img
              src="./logo.png"
              alt="logo"
              className="w-full h-full object-cover rounded-lg scale-110"
            />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">
              izTrack
            </p>
            <p className="text-slate-400 text-xs">Gestión Comercial</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
                ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }
              `}
            >
              <Icon
                className="w-4.5 h-4.5 flex-shrink-0"
                style={{ width: 18, height: 18 }}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-slate-400 text-xs">Sistema de Gestión</p>

          <p className="text-white text-xs font-medium mt-0.5">izTrack v1.0</p>

          <p className="text-slate-500 text-[10px] mt-2 leading-tight">
            © 2026 izTrack
            <br />
            Todos los derechos reservados
          </p>
          <p className="text-slate-600 text-[10px] mt-1">Licencia activa</p>
        </div>
      </div>
    </aside>
  );
}
