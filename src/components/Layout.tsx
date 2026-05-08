import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Page } from "../lib/types";

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

export function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* 🔵 SIDEBAR FIJO */}
      <div className="fixed left-0 top-0 h-screen w-64">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      </div>
      {/* ⚪ CONTENIDO SCROLL */}
      <main className="ml-64 flex-1 h-screen overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
