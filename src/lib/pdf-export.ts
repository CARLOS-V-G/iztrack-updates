import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { DailySummary, Expense, PAYMENT_METHOD_LABELS, PaymentMethod, Sale } from "./types";
import { formatCurrency, formatDate } from "./utils";
import {
  PDF_COLORS,
  addPdfFooter,
  addPdfHeader,
  addSectionTitle,
  addSummaryCards,
  ensurePdfSpace,
} from "./pdfTheme";

function setTextColor(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function formatTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPaymentBreakdown(sales: Sale[], totalSales: number) {
  return PAYMENT_METHODS.map((method) => {
    const methodSales = sales.filter((sale) => sale.payment_method === method);
    const amount = methodSales.reduce((sum, sale) => sum + Number(sale.amount), 0);

    return {
      method,
      label: PAYMENT_METHOD_LABELS[method],
      count: methodSales.length,
      amount,
      share: totalSales > 0 ? (amount / totalSales) * 100 : 0,
    };
  }).filter((row) => row.count > 0);
}

function getTopPaymentMethod(breakdown: ReturnType<typeof getPaymentBreakdown>) {
  return breakdown.reduce<(typeof breakdown)[number] | null>(
    (best, row) => (!best || row.amount > best.amount ? row : best),
    null,
  );
}

function extractScaleTickets(sales: Sale[]) {
  const rows: Array<{ sale: Sale; saleNumber: number; code: string; plu: string; amount: number }> = [];
  const ticketPattern = /(\d{13})\s+\$\s*([\d.]+)/g;

  sales.forEach((sale, index) => {
    if (!sale.notes?.includes("Tickets balanza:")) return;

    for (const match of sale.notes.matchAll(ticketPattern)) {
      const amount = Number(match[2].replace(/\./g, ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      rows.push({
        sale,
        saleNumber: index + 1,
        code: match[1],
        plu: match[1].slice(1, 7),
        amount,
      });
    }
  });

  return rows;
}

function drawTableHeader(
  doc: jsPDF,
  y: number,
  columns: Array<{ label: string; x: number; align?: "left" | "right" }>,
) {
  doc.setFillColor(PDF_COLORS.slate100[0], PDF_COLORS.slate100[1], PDF_COLORS.slate100[2]);
  doc.roundedRect(14, y - 5, doc.internal.pageSize.getWidth() - 28, 8, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setTextColor(doc, PDF_COLORS.slate500);

  columns.forEach((column) => {
    doc.text(column.label, column.x, y, { align: column.align || "left" });
  });

  return y + 8;
}

function writeEmptyState(doc: jsPDF, text: string, y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setTextColor(doc, PDF_COLORS.slate500);
  doc.text(text, 14, y);
  return y + 8;
}

export async function exportDailyReportPDF(
  date: string,
  summary: DailySummary,
  sales: Sale[],
  expenses: Expense[],
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = await addPdfHeader(
    doc,
    "Reporte diario",
    `Ventas y gastos - ${formatDate(date)}`,
    "izTrack Gestion Comercial",
  );

  const activeSales = sales.filter((sale) => !sale.voided);
  const voidedSales = sales.filter((sale) => sale.voided);
  const paidExpenses = expenses.filter((expense) => expense.status === "paid");
  const pendingExpenses = expenses.filter((expense) => expense.status === "pending");
  const paymentBreakdown = getPaymentBreakdown(activeSales, summary.totalSales);
  const topPaymentMethod = getTopPaymentMethod(paymentBreakdown);
  const averageSale = summary.salesCount > 0 ? summary.totalSales / summary.salesCount : 0;
  const profitMargin = summary.totalSales > 0 ? (summary.netProfit / summary.totalSales) * 100 : 0;
  const projectedProfit = summary.netProfit - summary.totalPendingExpenses;
  const scaleTickets = extractScaleTickets(activeSales);
  const scaleTicketsTotal = scaleTickets.reduce((sum, ticket) => sum + ticket.amount, 0);

  yPos = addSummaryCards(doc, [
    {
      label: "Ventas",
      value: formatCurrency(summary.totalSales),
      color: PDF_COLORS.blue700,
    },
    {
      label: "Gastos pagados",
      value: formatCurrency(summary.totalPaidExpenses),
      color: PDF_COLORS.red600,
    },
    {
      label: "Pendientes",
      value: formatCurrency(summary.totalPendingExpenses),
      color: PDF_COLORS.amber600,
    },
    {
      label: "Ganancia neta",
      value: formatCurrency(summary.netProfit),
      color: summary.netProfit >= 0 ? PDF_COLORS.green600 : PDF_COLORS.red600,
    },
  ], yPos);

  yPos = addSectionTitle(doc, "Resumen operativo", yPos);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setTextColor(doc, PDF_COLORS.slate700);
  doc.text(`${summary.salesCount} ventas activas`, margin, yPos);
  doc.text(`${voidedSales.length} anuladas`, margin + 48, yPos);
  doc.text(`${paidExpenses.length} gastos pagados`, margin + 88, yPos);
  doc.text(`${pendingExpenses.length} gastos pendientes`, margin + 142, yPos);
  yPos += 12;

  yPos = addSummaryCards(doc, [
    {
      label: "Ticket promedio",
      value: formatCurrency(averageSale),
      color: PDF_COLORS.slate700,
    },
    {
      label: "Margen",
      value: formatPercent(profitMargin),
      color: profitMargin >= 0 ? PDF_COLORS.green600 : PDF_COLORS.red600,
    },
    {
      label: "Medio principal",
      value: topPaymentMethod ? topPaymentMethod.label : "-",
      color: PDF_COLORS.blue700,
    },
    {
      label: "Cierre proyectado",
      value: formatCurrency(projectedProfit),
      color: projectedProfit >= 0 ? PDF_COLORS.green600 : PDF_COLORS.red600,
    },
  ], yPos);

  yPos = ensurePdfSpace(doc, yPos, 34);
  yPos = addSectionTitle(doc, "Ventas por medio de pago", yPos);

  if (paymentBreakdown.length === 0) {
    yPos = writeEmptyState(doc, "Sin ventas activas para detallar medios de pago.", yPos);
  } else {
    yPos = drawTableHeader(doc, yPos, [
      { label: "Medio", x: margin + 2 },
      { label: "Operaciones", x: margin + 68 },
      { label: "Participacion", x: margin + 104 },
      { label: "Total", x: pageWidth - margin - 2, align: "right" },
    ]);

    paymentBreakdown.forEach((row) => {
      yPos = ensurePdfSpace(doc, yPos, 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(row.label, margin + 2, yPos);
      doc.text(String(row.count), margin + 68, yPos);
      doc.text(formatPercent(row.share), margin + 104, yPos);

      doc.setFont("helvetica", "bold");
      setTextColor(doc, PDF_COLORS.blue700);
      doc.text(formatCurrency(row.amount), pageWidth - margin - 2, yPos, {
        align: "right",
      });

      yPos += 7;
    });
  }

  yPos += 4;
  yPos = ensurePdfSpace(doc, yPos, 34);
  yPos = addSectionTitle(doc, "Ventas registradas", yPos);

  if (sales.length === 0) {
    yPos = writeEmptyState(doc, "Sin ventas para este dia.", yPos);
  } else {
    yPos = drawTableHeader(doc, yPos, [
      { label: "Hora", x: margin + 2 },
      { label: "Medio", x: margin + 25 },
      { label: "Estado", x: margin + 58 },
      { label: "Notas", x: margin + 88 },
      { label: "Monto", x: pageWidth - margin - 2, align: "right" },
    ]);

    sales.forEach((sale) => {
      const noteLines = doc.splitTextToSize(sale.notes || "-", 72);
      const rowHeight = Math.max(8, noteLines.length * 4 + 4);
      yPos = ensurePdfSpace(doc, yPos, rowHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(formatTime(sale.created_at || sale.updated_at), margin + 2, yPos);
      doc.text(PAYMENT_METHOD_LABELS[sale.payment_method], margin + 25, yPos, { maxWidth: 28 });

      setTextColor(doc, sale.voided ? PDF_COLORS.red600 : PDF_COLORS.green600);
      doc.text(sale.voided ? "Anulada" : "Activa", margin + 58, yPos);

      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(noteLines, margin + 88, yPos);

      doc.setFont("helvetica", "bold");
      setTextColor(doc, sale.voided ? PDF_COLORS.red600 : PDF_COLORS.blue700);
      doc.text(formatCurrency(Number(sale.amount)), pageWidth - margin - 2, yPos, {
        align: "right",
      });

      yPos += rowHeight;
    });
  }

  if (scaleTickets.length > 0) {
    yPos += 4;
    yPos = ensurePdfSpace(doc, yPos, 34);
    yPos = addSectionTitle(doc, "Tickets de balanza", yPos);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTextColor(doc, PDF_COLORS.slate500);
    doc.text(
      `${scaleTickets.length} tickets leidos por ${formatCurrency(scaleTicketsTotal)} dentro de las ventas activas.`,
      margin,
      yPos,
    );
    yPos += 8;

    yPos = drawTableHeader(doc, yPos, [
      { label: "Codigo", x: margin + 2 },
      { label: "PLU", x: margin + 48 },
      { label: "Venta", x: margin + 80 },
      { label: "Medio", x: margin + 108 },
      { label: "Importe", x: pageWidth - margin - 2, align: "right" },
    ]);

    scaleTickets.forEach((ticket) => {
      yPos = ensurePdfSpace(doc, yPos, 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(ticket.code, margin + 2, yPos);
      doc.text(ticket.plu, margin + 48, yPos);
      doc.text(`Venta ${ticket.saleNumber}`, margin + 80, yPos);
      doc.text(PAYMENT_METHOD_LABELS[ticket.sale.payment_method], margin + 108, yPos, { maxWidth: 42 });

      doc.setFont("helvetica", "bold");
      setTextColor(doc, PDF_COLORS.blue700);
      doc.text(formatCurrency(ticket.amount), pageWidth - margin - 2, yPos, {
        align: "right",
      });

      yPos += 7;
    });
  }

  yPos += 4;
  yPos = ensurePdfSpace(doc, yPos, 34);
  yPos = addSectionTitle(doc, "Gastos registrados", yPos);

  if (expenses.length === 0) {
    yPos = writeEmptyState(doc, "Sin gastos para este dia.", yPos);
  } else {
    yPos = drawTableHeader(doc, yPos, [
      { label: "Concepto", x: margin + 2 },
      { label: "Medio", x: margin + 76 },
      { label: "Estado", x: margin + 110 },
      { label: "Notas", x: margin + 140 },
      { label: "Monto", x: pageWidth - margin - 2, align: "right" },
    ]);

    expenses.forEach((expense) => {
      const concept = expense.category
        ? `${expense.concept} (${expense.category})`
        : expense.concept;
      const conceptLines = doc.splitTextToSize(concept, 66);
      const noteLines = doc.splitTextToSize(expense.notes || "-", 34);
      const rowHeight = Math.max(8, Math.max(conceptLines.length, noteLines.length) * 4 + 4);
      yPos = ensurePdfSpace(doc, yPos, rowHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(conceptLines, margin + 2, yPos);
      doc.text(PAYMENT_METHOD_LABELS[expense.payment_method], margin + 76, yPos, { maxWidth: 30 });

      setTextColor(doc, expense.status === "paid" ? PDF_COLORS.green600 : PDF_COLORS.amber600);
      doc.text(expense.status === "paid" ? "Pagado" : "Pendiente", margin + 110, yPos);

      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(noteLines, margin + 140, yPos);

      doc.setFont("helvetica", "bold");
      setTextColor(doc, expense.status === "paid" ? PDF_COLORS.red600 : PDF_COLORS.amber600);
      doc.text(formatCurrency(Number(expense.amount)), pageWidth - margin - 2, yPos, {
        align: "right",
      });

      yPos += rowHeight;
    });
  }

  addPdfFooter(doc, "izTrack - Reporte diario");
  doc.save(`reporte-diario-${date}.pdf`);
}

export async function exportPageAsImage(elementId: string, fileName: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const imgData = canvas.toDataURL("image/png");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 10;

  doc.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - 20;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;
  }

  addPdfFooter(doc, "izTrack - Exportacion visual");
  doc.save(fileName);
}
