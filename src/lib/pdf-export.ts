import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { DailySummary, Expense, PAYMENT_METHOD_LABELS, Sale } from "./types";
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

  yPos = ensurePdfSpace(doc, yPos, 34);
  yPos = addSectionTitle(doc, "Ventas registradas", yPos);

  if (activeSales.length === 0) {
    yPos = writeEmptyState(doc, "Sin ventas activas para este dia.", yPos);
  } else {
    yPos = drawTableHeader(doc, yPos, [
      { label: "Medio de pago", x: margin + 2 },
      { label: "Notas", x: margin + 58 },
      { label: "Monto", x: pageWidth - margin - 2, align: "right" },
    ]);

    activeSales.forEach((sale) => {
      const noteLines = doc.splitTextToSize(sale.notes || "-", 82);
      const rowHeight = Math.max(8, noteLines.length * 4 + 4);
      yPos = ensurePdfSpace(doc, yPos, rowHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(PAYMENT_METHOD_LABELS[sale.payment_method], margin + 2, yPos);
      doc.text(noteLines, margin + 58, yPos);

      doc.setFont("helvetica", "bold");
      setTextColor(doc, PDF_COLORS.blue700);
      doc.text(formatCurrency(Number(sale.amount)), pageWidth - margin - 2, yPos, {
        align: "right",
      });

      yPos += rowHeight;
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
      { label: "Estado", x: margin + 96 },
      { label: "Monto", x: pageWidth - margin - 2, align: "right" },
    ]);

    expenses.forEach((expense) => {
      const concept = expense.category
        ? `${expense.concept} (${expense.category})`
        : expense.concept;
      const conceptLines = doc.splitTextToSize(concept, 76);
      const rowHeight = Math.max(8, conceptLines.length * 4 + 4);
      yPos = ensurePdfSpace(doc, yPos, rowHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextColor(doc, PDF_COLORS.slate700);
      doc.text(conceptLines, margin + 2, yPos);

      setTextColor(doc, expense.status === "paid" ? PDF_COLORS.green600 : PDF_COLORS.amber600);
      doc.text(expense.status === "paid" ? "Pagado" : "Pendiente", margin + 96, yPos);

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
