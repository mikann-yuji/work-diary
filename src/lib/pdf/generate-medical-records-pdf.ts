"use client";

import type { MedicalRecordImage } from "@/lib/image/generate-medical-record-images";

export async function generateMedicalRecordsPdf(
  images: MedicalRecordImage[],
  onProgress: (current: number, total: number) => void,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  for (let index = 0; index < images.length; index += 1) {
    if (index > 0) pdf.addPage("a4", "portrait");
    const dataUrl = await blobToDataUrl(images[index].blob);
    pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
    onProgress(index + 1, images.length);
  }
  const first = images[0];
  const last = images.at(-1) ?? first;
  const fileName = images.length === 1
    ? `medical-record_${first.date}_${first.recordId.slice(0, 8)}.pdf`
    : `medical-records_${first.date}_${last.date}.pdf`;
  const blob = pdf.output("blob");
  downloadBlob(blob, fileName);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("PDF image read failed"));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
