"use client";

import { createRoot, type Root } from "react-dom/client";
import { MedicalRecordExportPage, MEDICAL_EXPORT_DENSITY_LEVELS, type MedicalExportAttachment, type PreparedMedicalRecord } from "@/components/medical-record-export-page";
import { getMedicalImageBlob } from "@/lib/storage/medical-images";
import type { StoredMedicalRecord } from "@/types/medical-record";
import {
  captureExportPage,
  createOffscreenExportHost,
  waitForAnimationFrames,
  waitForExportFonts,
  waitForExportImages,
  waitForExportElement,
  withExportTimeout,
} from "@/lib/export/browser-export-runtime";

export class MedicalAttachmentLoadError extends Error {
  constructor(public readonly recordId: string) { super("Medical attachment could not be loaded"); this.name = "MedicalAttachmentLoadError"; }
}

export function sortMedicalRecords(records: StoredMedicalRecord[]) {
  return [...records].sort((a, b) => a.visitDate.localeCompare(b.visitDate) || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0) || a.id.localeCompare(b.id));
}

export async function prepareMedicalRecords(uid: string, records: StoredMedicalRecord[], onProgress: (current: number, total: number) => void, signal?: AbortSignal) {
  const sorted = sortMedicalRecords(records).filter((record) => record.uid === uid);
  const total = sorted.reduce((sum, record) => sum + record.prescriptionImages.length + record.medicationGuideImages.length, 0);
  let current = 0;
  const objectUrls: string[] = [];
  try {
    const prepared: PreparedMedicalRecord[] = [];
    for (const record of sorted) {
      const references = [
        ...record.prescriptionImages.map((image) => ({ ...image, label: "処方箋" })),
        ...record.medicationGuideImages.map((image) => ({ ...image, label: "薬の説明書" })),
      ];
      const attachments: MedicalExportAttachment[] = [];
      for (const image of references) {
        if (!image.path.startsWith(`users/${uid}/medicalRecords/${record.id}/`)) throw new MedicalAttachmentLoadError(record.id);
        try {
          const blob = await withExportTimeout(getMedicalImageBlob(image.path), 20_000, "wait-images", signal);
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          attachments.push({ id: image.id, label: image.label, url });
          current += 1;
          onProgress(current, total);
        } catch {
          throw new MedicalAttachmentLoadError(record.id);
        }
      }
      prepared.push({ record, attachments });
    }
    return { prepared, cleanup: () => objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url)) };
  } catch (error) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}

export async function renderFittedMedicalRecordPage(prepared: PreparedMedicalRecord, signal?: AbortSignal) {
  const host = createOffscreenExportHost();
  const root = createRoot(host);
  try {
    for (let density = 0; density < MEDICAL_EXPORT_DENSITY_LEVELS; density += 1) {
      root.render(<MedicalRecordExportPage prepared={prepared} density={density} />);
      const page = await waitForExportElement<HTMLElement>(host, "[data-medical-export-page]", signal);
      const content = await waitForExportElement<HTMLElement>(host, "[data-medical-export-content]", signal);
      await waitForAnimationFrames(2, signal);
      await waitForExportImages(host, signal);
      if (content.scrollHeight <= content.clientHeight + 1 && content.getBoundingClientRect().bottom <= page.getBoundingClientRect().bottom + 1) return { page, compact: density >= 2, cleanup: () => cleanup(root, host) };
    }
    const page = host.querySelector<HTMLElement>("[data-medical-export-page]");
    const content = host.querySelector<HTMLElement>("[data-medical-export-content]");
    if (!page || !content) throw new Error("Medical record page was not rendered");
    const scale = Math.min(1, content.clientHeight / Math.max(content.scrollHeight, 1));
    content.style.transform = `scale(${scale})`;
    content.style.width = `${100 / scale}%`;
    return { page, compact: true, cleanup: () => cleanup(root, host) };
  } catch (error) { cleanup(root, host); throw error; }
}

export async function captureMedicalRecordPage(prepared: PreparedMedicalRecord, signal?: AbortSignal) {
  const html2canvas = (await import("html2canvas")).default;
  await waitForExportFonts(signal);
  const rendered = await renderFittedMedicalRecordPage(prepared, signal);
  try {
    const canvas = await captureExportPage(rendered.page, html2canvas, signal);
    return { canvas, compact: rendered.compact };
  } finally { rendered.cleanup(); }
}

function cleanup(root: Root, host: HTMLDivElement) { root.unmount(); host.remove(); }
