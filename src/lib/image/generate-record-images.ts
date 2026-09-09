"use client";

import type { StoredWorkRecord } from "@/lib/firestore/records";
import { renderFittedRecordPage } from "@/lib/export/render-record-page";
import { canvasToPngBlob, captureExportPage, releaseCanvas, waitForExportFonts } from "@/lib/export/browser-export-runtime";

export type GeneratedRecordImage = {
  date: string;
  blob: Blob;
};

export async function generateRecordImages(
  records: StoredWorkRecord[],
  onProgress: (current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<GeneratedRecordImage[]> {
  const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedRecords.length === 0) throw new Error("No records selected");

  const html2canvas = (await import("html2canvas")).default;
  await waitForExportFonts();
  const images: GeneratedRecordImage[] = [];

  for (let index = 0; index < sortedRecords.length; index += 1) {
    const record = sortedRecords[index];
    onProgress(index + 1, sortedRecords.length);
    const rendered = await renderFittedRecordPage(record, signal);
    try {
      const canvas = await captureExportPage(rendered.page, html2canvas, signal);
      try {
        const blob = await canvasToPngBlob(canvas, signal);
        images.push({ date: record.date, blob });
      } finally {
        releaseCanvas(canvas);
      }
    } finally {
      rendered.cleanup();
    }
  }

  return images;
}
