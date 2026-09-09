"use client";

import type { PreparedMedicalRecord } from "@/components/medical-record-export-page";
import { captureMedicalRecordPage } from "@/lib/export/medical-record-export";
import { releaseCanvas, throwIfAborted } from "@/lib/export/browser-export-runtime";

export async function generateMedicalRecordsPdf(
  records: PreparedMedicalRecord[],
  onProgress: (current: number, total: number) => void,
  signal?: AbortSignal,
) {
  if (records.length === 0) throw new Error("No medical records selected");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  for (let index = 0; index < records.length; index += 1) {
    throwIfAborted(signal);
    onProgress(index + 1, records.length);
    const { canvas } = await captureMedicalRecordPage(records[index], signal);
    try {
      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
    } finally {
      releaseCanvas(canvas);
    }
  }

  const first = records[0].record;
  const last = records.at(-1)?.record ?? first;
  const fileName = records.length === 1
    ? `medical-record_${first.visitDate}_${first.id.slice(0, 8)}.pdf`
    : `medical-records_${first.visitDate}_${last.visitDate}.pdf`;
  return { blob: pdf.output("blob"), fileName };
}
