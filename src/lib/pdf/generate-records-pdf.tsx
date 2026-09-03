"use client";

import { createRoot, type Root } from "react-dom/client";
import { DailyRecordPdfPage, PDF_DENSITY_LEVELS } from "@/components/daily-record-pdf-page";
import type { StoredWorkRecord } from "@/lib/firestore/records";

export class PdfPageOverflowError extends Error {
  constructor(public readonly date: string) {
    super(`${date} does not fit on one A4 page`);
    this.name = "PdfPageOverflowError";
  }
}

export async function generateRecordsPdf(
  records: StoredWorkRecord[],
  onProgress: (current: number, total: number) => void,
) {
  const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedRecords.length === 0) throw new Error("No records selected");

  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;
  await document.fonts.ready;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  for (let index = 0; index < sortedRecords.length; index += 1) {
    const record = sortedRecords[index];
    onProgress(index + 1, sortedRecords.length);
    const rendered = await renderFittedPage(record);

    try {
      const canvas = await html2canvas(rendered.page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width: rendered.page.clientWidth,
        height: rendered.page.clientHeight,
        windowWidth: rendered.page.clientWidth,
        windowHeight: rendered.page.clientHeight,
      });
      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
      canvas.width = 1;
      canvas.height = 1;
    } finally {
      rendered.cleanup();
    }
  }

  const blob = pdf.output("blob");
  savePdfBlob(blob, createFileName(sortedRecords));
}

async function renderFittedPage(record: StoredWorkRecord) {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "297mm",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    for (let density = 0; density < PDF_DENSITY_LEVELS; density += 1) {
      root.render(<DailyRecordPdfPage record={record} density={density} />);
      await afterRender();
      const page = host.querySelector<HTMLElement>("[data-pdf-page]");
      const content = host.querySelector<HTMLElement>("[data-pdf-content]");
      if (!page || !content) throw new Error("PDF page was not rendered");
      const fits = content.scrollHeight <= content.clientHeight + 1
        && content.getBoundingClientRect().bottom <= page.getBoundingClientRect().bottom + 1;
      if (fits) return { page, cleanup: () => cleanupHost(root, host) };
    }
    throw new PdfPageOverflowError(record.date);
  } catch (error) {
    cleanupHost(root, host);
    throw error;
  }
}

function cleanupHost(root: Root, host: HTMLDivElement) {
  root.unmount();
  host.remove();
}

function afterRender() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function createFileName(records: StoredWorkRecord[]) {
  if (records.length === 1) return `work-diary_${records[0].date}.pdf`;
  return `work-diary_${records[0].date.slice(0, 7)}_${records.length}days.pdf`;
}

function savePdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";

  if ("download" in anchor) {
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return;
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), opened ? 60_000 : 1500);
}
