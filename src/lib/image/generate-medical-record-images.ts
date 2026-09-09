"use client";

import { captureMedicalRecordPage } from "@/lib/export/medical-record-export";
import { canvasToPngBlob, releaseCanvas } from "@/lib/export/browser-export-runtime";
import type { PreparedMedicalRecord } from "@/components/medical-record-export-page";

export type MedicalRecordImage = {
  recordId: string;
  date: string;
  blob: Blob;
  fileName: string;
  compact: boolean;
};

export async function generateMedicalRecordImages(
  records: PreparedMedicalRecord[],
  onProgress: (current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MedicalRecordImage[]> {
  const images: MedicalRecordImage[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const prepared = records[index];
    const { canvas, compact } = await captureMedicalRecordPage(prepared, signal);
    try {
      const blob = await canvasToPngBlob(canvas, signal);
      images.push({
        recordId: prepared.record.id,
        date: prepared.record.visitDate,
        blob,
        fileName: `medical-record_${prepared.record.visitDate}_${prepared.record.id.slice(0, 8)}.png`,
        compact,
      });
    } finally { releaseCanvas(canvas); }
    onProgress(index + 1, records.length);
  }
  return images;
}
