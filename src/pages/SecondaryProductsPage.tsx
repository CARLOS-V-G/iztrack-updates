import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Package,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { SecondaryProduct } from "../lib/types";
import { PageHeader } from "../components/Layout";
import { formatCurrency } from "../lib/utils";
import { Card } from "../components/ui/Card";

const emptyForm = {
  barcode: "",
  name: "",
  price: "",
  category: "",
  active: true,
};

export function SecondaryProductsPage() {
  const [products, setProducts] = useState<SecondaryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => barcodeRef.current?.focus(), 100);
    }
  }, [modalOpen]);

  const fetchProducts = useCallback(async () => {
    const data = (await window.api.getSecondaryProducts()) as SecondaryProduct[];
    setProducts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.active !== false &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.barcode.includes(search)),
      ),
    [products, search],
  );

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(product: SecondaryProduct) {
    setEditId(product.id);
    setForm({
      barcode: product.barcode,
      name: product.name,
      price: String(product.price),
      category: product.category || "",
      active: product.active,
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave() {
    setFormError("");

    if (!form.barcode.trim()) {
      setFormError("El codigo de barras es obligatorio");
      return;
    }
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    if (!form.price || Number(form.price) <= 0) {
      setFormError("El precio debe ser mayor a cero");
      return;
    }

    const cleanBarcode = form.barcode.trim().replace(/\D/g, "");
    const cleanName = form.name.trim();
    const duplicate = products.find(
      (p) =>
        p.id !== editId &&
        (p.barcode === cleanBarcode || p.name.toLowerCase() === cleanName.toLowerCase()),
    );
    if (duplicate) {
      setFormError(
        duplicate.barcode === cleanBarcode
          ? "Ya existe un producto con ese codigo de barras"
          : "Ya existe un producto con ese nombre",
      );
      return;
    }

    setSaving(true);
    try {
      const payload: Parameters<typeof window.api.saveSecondaryProduct>[0] = {
        barcode: cleanBarcode,
        name: cleanName,
        price: Number(form.price),
        category: form.category.trim() || undefined,
        active: form.active,
      };
      if (editId) payload.id = editId;

      await window.api.saveSecondaryProduct(payload);
      await fetchProducts();
      setModalOpen(false);
      showToast("success", editId ? "Producto actualizado" : "Producto creado");
    } catch {
      showToast("error", "Error al guardar el producto");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await window.api.deleteSecondaryProduct(deleteId);
      await fetchProducts();
      showToast("success", "Producto eliminado");
    } catch {
      showToast("error", "Error al eliminar el producto");
    } finally {
      setDeleteId(null);
    }
  }

  async function toggleActive(product: SecondaryProduct) {
    try {
      await window.api.saveSecondaryProduct({
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        category: product.category,
        active: !product.active,
      });
      await fetchProducts();
    } catch {
      showToast("error", "Error al cambiar estado");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        title="Productos Secundarios"
        subtitle="Gestiona productos con codigo de barras: sobres, especias, etc."
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo Producto
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
              toast.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {toast.message}
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o codigo de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 animate-pulse">
            Cargando productos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Package className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">
              {search ? "Sin resultados" : "No hay productos secundarios"}
            </p>
            <p className="text-xs mt-1">
              {search
                ? "Prueba con otro termino de busqueda"
                : "Agrega productos como especias en sobre con su codigo de barras"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((product) => (
              <Card key={product.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Barcode className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {product.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
                          {product.barcode}
                        </span>
                      </div>
                      {product.category && (
                        <p className="text-xs text-slate-400 mt-0.5">{product.category}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-base font-bold text-slate-900 tabular-nums">
                      {formatCurrency(product.price)}
                    </span>
                    <button
                      onClick={() => toggleActive(product)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        product.active
                          ? "text-green-600 hover:bg-green-50"
                          : "text-slate-300 hover:bg-slate-100"
                      }`}
                      title={product.active ? "Desactivar" : "Activar"}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(product)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(product.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {editId ? "Editar Producto" : "Nuevo Producto"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
              <div className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {formError}
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1.5">
                    Codigo de Barras
                  </label>
                  <input
                    ref={barcodeRef}
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    placeholder="Ej: 7798224212271"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1.5">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Albahaca seca en sobre"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1.5">
                    Precio
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="Ej: 250"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1.5">
                    Categoria <span className="text-slate-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Ej: Especias, Condimentos"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : editId ? "Guardar Cambios" : "Crear Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Eliminar producto</h3>
                <p className="text-sm text-slate-500">
                  Esta accion no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
