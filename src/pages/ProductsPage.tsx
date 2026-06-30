import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  Edit2,
  Package,
  Plus,
  ScanBarcode,
  Search,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { Toast } from "../components/ui/Toast";
import { Badge } from "../components/ui/Badge";
import { PageHeader } from "../components/Layout";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "../lib/types";
import { formatCurrency } from "../lib/utils";

type ToastState = { message: string; type: "success" | "error" | "warning" };

type ProductForm = {
  plu: string;
  name: string;
  category: string;
  price: string;
  price_per_kg: string;
  stock: string;
  stock_min: string;
  unit: string;
  notes: string;
  active: boolean;
};

const EMPTY_FORM: ProductForm = {
  plu: "",
  name: "",
  category: "Sin categoria",
  price: "",
  price_per_kg: "",
  stock: "",
  stock_min: "",
  unit: "unidad",
  notes: "",
  active: true,
};

function getStockStatus(stock?: number, stockMin?: number): "ok" | "low" | "empty" | "unknown" {
  if (stock === undefined || stock === null) return "unknown";
  if (stock === 0) return "empty";
  if (stockMin !== undefined && stock <= stockMin) return "low";
  return "ok";
}

const stockStatusColors = {
  ok: "text-green-600",
  low: "text-amber-600",
  empty: "text-red-600",
  unknown: "text-slate-400",
};

const stockStatusLabels = {
  ok: "Stock ok",
  low: "Stock bajo",
  empty: "Sin stock",
  unknown: "No medido",
};

function StockBadge({ stock, stockMin }: { stock?: number; stockMin?: number }) {
  const status = getStockStatus(stock, stockMin);
  if (status === "unknown") return null;

  const colorMap = {
    ok: "green" as const,
    low: "amber" as const,
    empty: "red" as const,
    unknown: "slate" as const,
  };

  return (
    <div className="flex items-center gap-1">
      {(status === "low" || status === "empty") && (
        <AlertTriangle className="w-3 h-3 text-amber-500" />
      )}
      <Badge label={`${stock} ${stockStatusLabels[status]}`} color={colorMap[status]} />
    </div>
  );
}

function productToForm(p: Product): ProductForm {
  return {
    plu: p.plu,
    name: p.name,
    category: p.category || "Sin categoria",
    price: p.price !== undefined ? String(p.price) : "",
    price_per_kg: p.price_per_kg !== undefined && p.price_per_kg > 0 ? String(p.price_per_kg) : "",
    stock: p.stock !== undefined ? String(p.stock) : "",
    stock_min: p.stock_min !== undefined ? String(p.stock_min) : "",
    unit: p.unit || "unidad",
    notes: p.notes || "",
    active: p.active,
  };
}

function formToProduct(form: ProductForm, existing?: Product): Omit<Product, "id" | "created_at" | "updated_at"> {
  return {
    plu: form.plu.trim(),
    name: form.name.trim(),
    category: form.category || "Sin categoria",
    price: form.price !== "" ? Number(form.price) : undefined,
    price_per_kg: form.price_per_kg !== "" ? Number(form.price_per_kg) : 0,
    stock: form.stock !== "" ? Number(form.stock) : undefined,
    stock_min: form.stock_min !== "" ? Number(form.stock_min) : undefined,
    unit: form.unit || "unidad",
    notes: form.notes.trim() || undefined,
    active: form.active,
    ...(existing ? { id: existing.id, created_at: existing.created_at } : {}),
  };
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [showActive, setShowActive] = useState<"all" | "active" | "inactive">("all");
  const [toast, setToast] = useState<ToastState | null>(null);

  // Modal de edicion/creacion
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmacion de borrado
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.getProducts();
      setProducts(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const usedCategories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category || "Sin categoria"));
    return ["todas", ...PRODUCT_CATEGORIES.filter((c) => cats.has(c)), ...Array.from(cats).filter((c) => !PRODUCT_CATEGORIES.includes(c))];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (showActive === "active" && !p.active) return false;
      if (showActive === "inactive" && p.active) return false;
      if (categoryFilter !== "todas" && (p.category || "Sin categoria") !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.plu.includes(q) || (p.category || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, search, categoryFilter, showActive]);

  const lowStockCount = useMemo(
    () => products.filter((p) => {
      const s = getStockStatus(p.stock, p.stock_min);
      return s === "low" || s === "empty";
    }).length,
    [products]
  );

  // ------- Modal handlers -------

  function openNew() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditingProduct(p);
    setForm(productToForm(p));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    setFormError(null);
  }

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setFormError(null);

    if (!form.plu.trim()) { setFormError("El PLU es obligatorio"); return; }
    if (!form.name.trim()) { setFormError("El nombre es obligatorio"); return; }
    if (form.plu.replace(/\D/g, "") === "") { setFormError("El PLU debe contener numeros"); return; }

    // Verificar PLU duplicado (solo en nuevos)
    if (!editingProduct) {
      const pluNormalized = form.plu.replace(/\D/g, "").padStart(6, "0");
      const exists = products.some((p) => p.plu === pluNormalized);
      if (exists) {
        setFormError(`Ya existe un producto con PLU ${pluNormalized}`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = formToProduct(form, editingProduct || undefined);
      await window.api.saveProduct(payload as Parameters<typeof window.api.saveProduct>[0]);
      await fetchProducts();
      closeModal();
      setToast({ message: editingProduct ? "Producto actualizado" : "Producto creado", type: "success" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar el producto");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(p: Product) {
    try {
      await window.api.saveProduct({ ...p, active: !p.active });
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, active: !p.active } : x));
    } catch {
      setToast({ message: "No se pudo cambiar el estado", type: "error" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await window.api.deleteProduct(deleteTarget.id);
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setToast({ message: "Producto eliminado", type: "success" });
    } catch {
      setToast({ message: "Error al eliminar el producto", type: "error" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-fade-in">
        <div className="h-16 w-80 rounded-xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Catalogo de Productos"
        subtitle={`${products.length} productos registrados`}
        actions={
          <div className="flex items-center gap-2">
            {lowStockCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" />
                {lowStockCount} con stock bajo
              </div>
            )}
            <Button onClick={openNew} variant="primary" size="sm">
              <Plus className="w-4 h-4" />
              Nuevo producto
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6 animate-fade-in">
        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{products.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total productos</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{products.filter((p) => p.active).length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Activos</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{lowStockCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Stock bajo / sin stock</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-600">{new Set(products.map((p) => p.category || "Sin categoria")).size}</p>
            <p className="text-xs text-slate-500 mt-0.5">Categorias</p>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, PLU o categoria..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex gap-1.5">
              {(["all", "active", "inactive"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setShowActive(v)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    showActive === v
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {v === "all" ? "Todos" : v === "active" ? "Activos" : "Inactivos"}
                </button>
              ))}
            </div>
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {usedCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  categoryFilter === cat
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat === "todas" ? "Todas las categorias" : cat}
              </button>
            ))}
          </div>
        </Card>

        {/* Lista de productos */}
        {filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-600 font-medium">
              {search || categoryFilter !== "todas" ? "Sin resultados para el filtro" : "No hay productos registrados"}
            </p>
            {!search && categoryFilter === "todas" && (
              <Button onClick={openNew} variant="primary" size="sm" className="mt-4">
                <Plus className="w-4 h-4" />
                Agregar primer producto
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const stockStatus = getStockStatus(p.stock, p.stock_min);
              return (
                <Card
                  key={p.id}
                  className={`p-4 hover:shadow-md transition-all duration-200 group ${!p.active ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                        {!p.active && <Badge label="Inactivo" color="slate" />}
                      </div>

                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <ScanBarcode className="w-3 h-3" />
                          PLU {p.plu}
                        </span>
                        {p.category && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Tag className="w-3 h-3" />
                            {p.category}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {p.price !== undefined && (
                          <span className="text-sm font-semibold text-blue-700">
                            {formatCurrency(p.price)}
                            {p.unit && <span className="text-xs text-slate-500 font-normal ml-0.5">/ {p.unit}</span>}
                          </span>
                        )}
                        {p.price_per_kg !== undefined && p.price_per_kg > 0 && (
                          <span className="text-xs text-slate-500">
                            Balanza: {formatCurrency(p.price_per_kg)}/kg
                          </span>
                        )}
                      </div>

                      <div className="mt-2">
                        {p.stock !== undefined ? (
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1 text-xs font-medium ${stockStatusColors[stockStatus]}`}>
                              {(stockStatus === "low" || stockStatus === "empty") && <TrendingDown className="w-3 h-3" />}
                              <Box className="w-3 h-3" />
                              {p.stock} {p.unit || "u."}
                            </div>
                            {p.stock_min !== undefined && (
                              <span className="text-[10px] text-slate-400">min: {p.stock_min}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Stock no configurado</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`p-1.5 rounded-lg transition-all ${p.active ? "text-green-500 hover:bg-green-50" : "text-slate-400 hover:bg-slate-100"}`}
                        title={p.active ? "Desactivar" : "Activar"}
                      >
                        {p.active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stock progress bar */}
                  {p.stock !== undefined && p.stock_min !== undefined && p.stock_min > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            stockStatus === "empty" ? "bg-red-500" :
                            stockStatus === "low" ? "bg-amber-500" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min((p.stock / (p.stock_min * 3)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal agregar/editar */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingProduct ? `Editar: ${editingProduct.name}` : "Nuevo producto"}
        size="md"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {formError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">PLU *</label>
              <input
                type="text"
                value={form.plu}
                onChange={(e) => updateForm("plu", e.target.value)}
                placeholder="Ej: 00001"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Unidad</label>
              <select
                value={form.unit}
                onChange={(e) => updateForm("unit", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {PRODUCT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              placeholder="Nombre del producto"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Categoria</label>
            <select
              value={form.category}
              onChange={(e) => updateForm("category", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Precio de venta</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => updateForm("price", e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-6 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Precio balanza ($/kg)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_per_kg}
                  onChange={(e) => updateForm("price_per_kg", e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-6 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Stock actual</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={(e) => updateForm("stock", e.target.value)}
                placeholder="Cantidad"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">Stock minimo</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.stock_min}
                onChange={(e) => updateForm("stock_min", e.target.value)}
                placeholder="Alerta cuando baje de..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm("notes", e.target.value)}
              placeholder="Observaciones opcionales"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                className={`w-10 h-6 rounded-full transition-all duration-200 flex items-center ${form.active ? "bg-green-500" : "bg-slate-300"}`}
                onClick={() => updateForm("active", !form.active)}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 mx-0.5 ${form.active ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-slate-700">Producto activo</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" size="sm" onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
              {editingProduct ? "Guardar cambios" : "Crear producto"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmacion borrado */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Eliminar producto"
        message={`Se eliminara "${deleteTarget?.name}" (PLU ${deleteTarget?.plu}). Esta accion no se puede deshacer.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
