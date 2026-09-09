"use client";

import { createRoot, type Root } from "react-dom/client";
import { MedicalRecordExportPage, MEDICAL_EXPORT_DENSITY_LEVELS, type MedicalExportAttachment, type PreparedMedicalRecord } from "@/components/medical-record-export-page";
import { getMedicalImageBlob } from "@/lib/storage/medical-images";
import type { StoredMedicalRecord } from "@/types/medical-record";

export class MedicalAttachmentLoadError extends Error {
  constructor(public readonly recordId: string) { super("Medical attachment could not be loaded"); this.name = "MedicalAttachmentLoadError"; }
}

export function sortMedicalRecords(records: StoredMedicalRecord[]) {
  return [...records].sort((a, b) => a.visitDate.localeCompare(b.visitDate) || (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0) || a.id.localeCompare(b.id));
}

export async function prepareMedicalRecords(uid: string, records: StoredMedicalRecord[], onProgress: (current: number, total: number) => void) {
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
          const blob = await withTimeout(getMedicalImageBlob(image.path), 20_000, "Medical attachment timed out");
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

export async function renderFittedMedicalRecordPage(prepared: PreparedMedicalRecord) {
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "0", top: "0", width: "210mm", height: "297mm", pointerEvents: "none", zIndex: "-1" });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    for (let density = 0; density < MEDICAL_EXPORT_DENSITY_LEVELS; density += 1) {
      root.render(<MedicalRecordExportPage prepared={prepared} density={density} />);
      await afterRender();
      await waitForImages(host);
      const page = host.querySelector<HTMLElement>("[data-medical-export-page]");
      const content = host.querySelector<HTMLElement>("[data-medical-export-content]");
      if (!page || !content) throw new Error("Medical record page was not rendered");
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

export async function captureMedicalRecordPage(prepared: PreparedMedicalRecord) {
  const html2canvas = (await import("html2canvas")).default;
  await withTimeout(document.fonts.ready, 5_000, "Font loading timed out").catch(() => undefined);
  const rendered = await renderFittedMedicalRecordPage(prepared);
  try {
    const canvas = await html2canvas(rendered.page, { scale: 2, backgroundColor: "#ffffff", useCORS: false, logging: false, width: rendered.page.clientWidth, height: rendered.page.clientHeight, windowWidth: rendered.page.clientWidth, windowHeight: rendered.page.clientHeight });
    return { canvas, compact: rendered.compact };
  } finally { rendered.cleanup(); }
}

function cleanup(root: Root, host: HTMLDivElement) { root.unmount(); host.remove(); }
function afterRender() { return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
async function waitForImages(host: HTMLElement) {
  await withTimeout(Promise.all([...host.querySelectorAll("img")].map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Image load failed")); }))), 15_000, "Image rendering timed out");
}

export function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then((value) => { window.clearTimeout(timer); resolve(value); }, (error) => { window.clearTimeout(timer); reject(error); });
  });
}
