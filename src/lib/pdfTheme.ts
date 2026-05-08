import type jsPDF from "jspdf";
import logoUrl from "../assets/logo.png";

type Rgb = [number, number, number];

export type PdfSummaryCard = {
  label: string;
  value: string;
  color: Rgb;
};

export const PDF_COLORS = {
  slate950: [15, 23, 42] as Rgb,
  slate700: [51, 65, 85] as Rgb,
  slate500: [100, 116, 139] as Rgb,
  slate300: [203, 213, 225] as Rgb,
  slate100: [241, 245, 249] as Rgb,
  blue700: [29, 78, 216] as Rgb,
  green600: [22, 163, 74] as Rgb,
  red600: [220, 38, 38] as Rgb,
  amber600: [217, 119, 6] as Rgb,
  white: [255, 255, 255] as Rgb,
};

let logoPromise: Promise<HTMLImageElement | null> | null = null;

function setTextColor(doc: jsPDF, color: Rgb) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}

export function formatGeneratedAt() {
  return new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function loadPdfLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = logoUrl;
    });
  }

  return logoPromise;
}

export async function addPdfHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  meta: string,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await loadPdfLogo();

  setFillColor(doc, PDF_COLORS.slate950);
  doc.rect(0, 0, pageWidth, 36, "F");

  if (logo) {
    doc.addImage(logo, "PNG", 14, 8, 22, 22);
  } else {
    setTextColor(doc, PDF_COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("izTrack", 14, 20);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  setTextColor(doc, PDF_COLORS.white);
  doc.text(title, 44, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle, 44, 22);

  setTextColor(doc, PDF_COLORS.slate300);
  doc.text(meta, pageWidth - 14, 15, { align: "right" });
  doc.text(`Generado: ${formatGeneratedAt()}`, pageWidth - 14, 22, {
    align: "right",
  });

  setTextColor(doc, PDF_COLORS.slate700);
  return 47;
}

export function addPdfFooter(doc: jsPDF, footerLabel = "izTrack") {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(PDF_COLORS.slate300[0], PDF_COLORS.slate300[1], PDF_COLORS.slate300[2]);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setTextColor(doc, PDF_COLORS.slate500);
    doc.text(footerLabel, 14, pageHeight - 8);
    doc.text(`Pagina ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
  }
}

export function addSummaryCards(
  doc: jsPDF,
  cards: PdfSummaryCard[],
  y: number,
  margin = 14,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 4;
  const width = (pageWidth - margin * 2 - gap * (cards.length - 1)) / cards.length;
  const height = 22;

  cards.forEach((card, index) => {
    const x = margin + index * (width + gap);

    setFillColor(doc, PDF_COLORS.slate100);
    doc.roundedRect(x, y, width, height, 3, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setTextColor(doc, PDF_COLORS.slate500);
    doc.text(card.label, x + 4, y + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setTextColor(doc, card.color);
    doc.text(card.value, x + 4, y + 16, { maxWidth: width - 8 });
  });

  return y + height + 10;
}

export function addSectionTitle(doc: jsPDF, title: string, y: number, x = 14) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setTextColor(doc, PDF_COLORS.slate950);
  doc.text(title, x, y);
  return y + 6;
}

export function ensurePdfSpace(doc: jsPDF, y: number, needed: number, top = 18) {
  const pageHeight = doc.internal.pageSize.getHeight();

  if (y + needed <= pageHeight - 22) return y;

  doc.addPage();
  return top;
}
