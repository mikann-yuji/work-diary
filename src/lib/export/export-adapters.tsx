"use client";

import { DailyRecordPdfPage, PDF_DENSITY_LEVELS } from "@/components/daily-record-pdf-page";
import { MedicalRecordExportPage, MEDICAL_EXPORT_DENSITY_LEVELS, type MedicalExportAttachment } from "@/components/medical-record-export-page";
import type { StoredWorkRecord } from "@/lib/firestore/records";
import { getMedicalImageBlob } from "@/lib/storage/medical-images";
import type { StoredMedicalRecord } from "@/types/medical-record";
import { withExportTimeout } from "@/lib/export/browser-export-runtime";
import type { ExportAdapter, ExportPage, LoadedAssets } from "@/lib/export/export-engine";

type MedicalAssets = LoadedAssets & { attachments: MedicalExportAttachment[] };

export const workExportAdapter: ExportAdapter<StoredWorkRecord, LoadedAssets> = {
  recordType: "work",
  densityLevels: PDF_DENSITY_LEVELS,
  pageSelector: "[data-pdf-page]",
  contentSelector: "[data-pdf-content]",
  sortPages: (pages) => [...pages].sort((a, b) => a.date.localeCompare(b.date)),
  loadAssets: async () => ({ cleanup: () => undefined }),
  renderPage: (page, _assets, density) => <DailyRecordPdfPage record={page.data} density={density} />,
  getPageFileName: (page) => `work-diary_${page.date}.png`,
  getPdfFileName: (pages) => pages.length === 1 ? `work-diary_${pages[0].date}.pdf` : `work-diary_${pages[0].date.slice(0, 7)}_${pages.length}days.pdf`,
};

export function createMedicalExportAdapter(uid: string): ExportAdapter<StoredMedicalRecord, MedicalAssets> {
  return {
    recordType: "medical",
    densityLevels: MEDICAL_EXPORT_DENSITY_LEVELS,
    pageSelector: "[data-medical-export-page]",
    contentSelector: "[data-medical-export-content]",
    sortPages: (pages) => [...pages].sort((a, b) => a.date.localeCompare(b.date) || timestamp(a.data) - timestamp(b.data) || a.id.localeCompare(b.id)),
    loadAssets: async (page, signal, onProgress) => {
      if (page.data.uid !== uid) throw new Error("Record owner mismatch");
      const references = [
        ...page.data.prescriptionImages.map((image) => ({ ...image, label: "処方箋" })),
        ...page.data.medicationGuideImages.map((image) => ({ ...image, label: "薬の説明書" })),
        ...page.data.diagnosisResultImages.map((image) => ({ ...image, label: "診断結果" })),
      ];
      const urls: string[] = [];
      const attachments: MedicalExportAttachment[] = [];
      try {
        for (let index = 0; index < references.length; index += 1) {
          const image = references[index];
          if (!image.path.startsWith(`users/${uid}/medicalRecords/${page.id}/`)) throw new Error("Attachment owner mismatch");
          const blob = await withExportTimeout(getMedicalImageBlob(image.path), 10_000, "wait-images", signal);
          const url = URL.createObjectURL(blob);
          urls.push(url);
          attachments.push({ id: image.id, label: image.label, url });
          onProgress(index + 1, references.length);
        }
        return { attachments, cleanup: () => urls.splice(0).forEach((url) => URL.revokeObjectURL(url)) };
      } catch (error) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        throw error;
      }
    },
    renderPage: (page, assets, density) => <MedicalRecordExportPage prepared={{ record: page.data, attachments: assets.attachments }} density={density} />,
    fitOverflow: (content) => {
      const scale = Math.min(1, content.clientHeight / Math.max(content.scrollHeight, 1));
      content.style.transform = `scale(${scale})`;
      content.style.width = `${100 / scale}%`;
      return true;
    },
    getPageFileName: (page) => `medical-record_${page.date}_${page.id.slice(0, 8)}.png`,
    getPdfFileName: (pages) => pages.length === 1 ? `medical-record_${pages[0].date}_${pages[0].id.slice(0, 8)}.pdf` : `medical-records_${pages[0].date}_${pages.at(-1)!.date}.pdf`,
  };
}

export function workExportPages(records: StoredWorkRecord[]): ExportPage<StoredWorkRecord>[] {
  return records.map((record) => ({ id: record.id, date: record.date, data: record }));
}

export function medicalExportPages(records: StoredMedicalRecord[]): ExportPage<StoredMedicalRecord>[] {
  return records.map((record) => ({ id: record.id, date: record.visitDate, data: record }));
}

function timestamp(record: StoredMedicalRecord) { return record.createdAt?.toMillis() ?? 0; }
