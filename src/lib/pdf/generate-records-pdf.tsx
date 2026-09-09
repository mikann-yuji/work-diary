"use client";

import type { StoredWorkRecord } from "@/lib/firestore/records";
import { RecordPageOverflowError, renderFittedRecordPage, waitForExportFonts, withExportTimeout } from "@/lib/export/render-record-page";

export { RecordPageOverflowError as PdfPageOverflowError };

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
  await waitForExportFonts();

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  for (let index = 0; index < sortedRecords.length; index += 1) {
    const record = sortedRecords[index];
    onProgress(index + 1, sortedRecords.length);
    const rendered = await renderFittedRecordPage(record);

    try {
      const canvas = await withExportTimeout(html2canvas(rendered.page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width: rendered.page.clientWidth,
        height: rendered.page.clientHeight,
        windowWidth: rendered.page.clientWidth,
        windowHeight: rendered.page.clientHeight,
      }), 30_000, "PDF page generation timed out");
      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
      canvas.width = 1;
      canvas.height = 1;
    } finally {
      rendered.cleanup();
    }
  }

  return { blob: pdf.output("blob"), fileName: createFileName(sortedRecords) };
}

function createFileName(records: StoredWorkRecord[]) {
  if (records.length === 1) return `work-diary_${records[0].date}.pdf`;
  return `work-diary_${records[0].date.slice(0, 7)}_${records.length}days.pdf`;
}
