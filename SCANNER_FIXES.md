# Scanner Desktop - Fixes Implementadas

## Resumen
Se implementaron 4 correcciones críticas para resolver los problemas del scanner:

### ✅ FIX #1: Scanner se desactiva al navegar
**Problema:** Al cambiar de sección (ej: Gastos), el scanner se desactivaba y no volvía a activarse.

**Causa:** El `useEffect` de scanner tenía cleanup que llamaba `toggleScannerMode(false)` al desmontar el componente.

**Solución:** 
- Removimos el cleanup del useEffect
- Persistimos `scannerMode` en `sessionStorage` 
- El scanner ahora se mantiene activo al navegar
- Se desactiva solo cuando se guarda una venta o se limpia el formulario

**Código:**
```typescript
useEffect(() => {
  window.api.toggleScannerMode(scannerMode);
  saveScannerModeState(scannerMode);
  // No cleanup - scanner stays active on navigation
}, [scannerMode]);
```

---

### ✅ FIX #2: Datos escaneados se pierden al navegar
**Problema:** Al navegar a otra sección, los tickets escaneados y el monto se perdían.

**Causa:** Todos los datos estaban solo en estado de React, se destruían al desmontar el componente.

**Solución:**
- Creamos funciones `saveSalesDraft()` / `getSalesDraft()` para persistir en sessionStorage
- Agregamos un useEffect que guarda el draft automáticamente cada 500ms (debounced)
- El draft incluye: form, amountPaid, baseAmount, surcharge, discount, scannedTickets

**Código:**
```typescript
// Auto-save draft every 500ms
useEffect(() => {
  if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
  
  draftSaveTimeoutRef.current = setTimeout(() => {
    if (!editSale) {
      const draft: SaleDraft = { form, amountPaid, baseAmount, surcharge, customSurcharge, discount, customDiscount, scannedTickets };
      saveSalesDraft(draft);
    }
  }, 500);
  
  return () => clearTimeout(draftSaveTimeoutRef.current);
}, [form, amountPaid, baseAmount, surcharge, customSurcharge, discount, customDiscount, scannedTickets, editSale]);
```

---

### ✅ FIX #3: Monto no se actualiza sin refrescar
**Problema:** Cuando se escanean tickets fuera de la ventana de Ventas, no se refleja la información.

**Causa:** No había polling de datos. La tabla de ventas se cargaba una sola vez al montar el componente.

**Solución:**
- Agregamos polling cada 2 segundos que llama `fetchSales()`
- Ahora los cambios en la tabla se ven en tiempo real
- El polling se cancela al desmontar el componente

**Código:**
```typescript
useEffect(() => {
  fetchSales();
  
  const pollInterval = setInterval(() => {
    fetchSales();
  }, 2000);
  
  return () => clearInterval(pollInterval);
}, [fetchSales]);
```

---

### ✅ FIX #4: Ticket se pierde después de refrescar
**Problema:** Al presionar F5 o refrescar el navegador, todos los datos escaneados se perdían.

**Causa:** No se guardaban en sessionStorage, solo en React state.

**Solución:**
- Al montar el componente, intentamos restaurar el draft desde sessionStorage
- Usamos `useState` con inicializadores que leen de sessionStorage
- Si no hay draft guardado, usamos valores por defecto vacíos

**Código:**
```typescript
const savedDraft = getSalesDraft();

const [form, setForm] = useState<SaleForm>(savedDraft?.form || emptyForm);
const [amountPaid, setAmountPaid] = useState(savedDraft?.amountPaid || "");
const [scannedTickets, setScannedTickets] = useState<ScannedTicket[]>(savedDraft?.scannedTickets || []);
const [scannerMode, setScannerMode] = useState(getScannerModeState());
```

---

## Archivos Modificados
- `src/pages/SalesPage.tsx` - Todas las correcciones implementadas

## Helper Functions Agregadas
```typescript
function getSalesDraft(): SaleDraft | null
function saveSalesDraft(draft: SaleDraft): void
function clearSalesDraft(): void
function getScannerModeState(): boolean
function saveScannerModeState(active: boolean): void
function clearScannerModeState(): void
```

---

## Pruebas Recomendadas

### Escenario 1: Scanner activo al navegar
1. Abre Ventas
2. Activa "Escaneo activo"
3. Navega a Gastos
4. Vuelve a Ventas
5. ✅ Scanner debe seguir activo

### Escenario 2: Datos persisten al navegar
1. Escanea 3 tickets (monto debe estar entre $100-500)
2. Navega a Gastos
3. Vuelve a Ventas
4. ✅ Los 3 tickets deben estar allí con el monto total

### Escenario 3: Refresh no pierde datos
1. Escanea 5 tickets
2. Presiona F5 (refrescar página)
3. ✅ Los 5 tickets deben estar allí después del refresh

### Escenario 4: Monto se actualiza en tiempo real
1. Ten dos navegadores abiertos
2. En uno: escanea un ticket
3. En el otro: navega a Ventas
4. ✅ La tabla debe mostrar la nueva venta en 2 segundos

### Escenario 5: Limpieza al guardar
1. Escanea 3 tickets
2. Guarda la venta
3. ✅ El formulario debe limpiarse
4. ✅ Scanner debe desactivarse
5. ✅ sessionStorage debe limpiarse

---

## Notas Técnicas

### Performance
- El polling ocurre cada 2 segundos (configurable en línea ~338)
- El guardado de draft es debounced a 500ms (configurable)
- No se guarda draft mientras se edita una venta existente

### sessionStorage vs localStorage
Usamos `sessionStorage` porque:
- Los datos son válidos solo para la sesión actual
- Se limpian automáticamente al cerrar la pestaña
- Es el comportamiento esperado para un draft temporal

### Limpiar sessionStorage manualmente
Si necesitas resetear todo:
```javascript
sessionStorage.removeItem('sales_draft');
sessionStorage.removeItem('scanner_mode_active');
```

