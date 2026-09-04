"use client";

import type { StoredWorkRecord } from "@/lib/firestore/records";
import { renderFittedRecordPage } from "@/lib/export/render-record-page";

export type GeneratedRecordImage = {
  date: string;
  blob: Blob;
};

export async function generateRecordImages(
  records: StoredWorkRecord[],
  onProgress: (current: number, total: number) => void,
): Promise<GeneratedRecordImage[]> {
  const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedRecords.length === 0) throw new Error("No records selected");

  const html2canvas = (await import("html2canvas")).default;
  await document.fonts.ready;
  const images: GeneratedRecordImage[] = [];

  for (let index = 0; index < sortedRecords.length; index += 1) {
    const record = sortedRecords[index];
    onProgress(index + 1, sortedRecords.length);
    const rendered = await renderFittedRecordPage(record);
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
      const blob = await canvasToBlob(canvas);
      images.push({ date: record.date, blob });
      canvas.width = 1;
      canvas.height = 1;
    } finally {
      rendered.cleanup();
    }
  }

  return images;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG generation failed")), "image/png");
  });
}
