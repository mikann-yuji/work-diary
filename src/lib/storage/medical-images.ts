"use client";

import { deleteObject, getBlob, ref, uploadBytesResumable } from "firebase/storage";
import { firebaseStorage } from "@/lib/firebase/client";
import type { MedicalImageKind, MedicalImageReference } from "@/types/medical-record";

export async function prepareMedicalImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new UnsupportedMedicalImageError();
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new UnsupportedMedicalImageError();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToJpeg(canvas);
  } catch {
    throw new UnsupportedMedicalImageError();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadMedicalImage(
  uid: string,
  recordId: string,
  kind: MedicalImageKind,
  blob: Blob,
  onProgress: (progress: number) => void,
): Promise<MedicalImageReference> {
  const id = crypto.randomUUID();
  const path = `users/${uid}/medical-records/${recordId}/${kind}/${id}.jpg`;
  const task = uploadBytesResumable(ref(firebaseStorage, path), blob, { contentType: "image/jpeg", cacheControl: "private,max-age=3600" });
  await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => onProgress(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0), reject, resolve));
  return { id, path, contentType: "image/jpeg" };
}

export function getMedicalImageBlob(path: string) {
  return getBlob(ref(firebaseStorage, path));
}

export async function deleteMedicalImage(path: string) {
  try { await deleteObject(ref(firebaseStorage, path)); } catch { /* A missing object is already safely removed. */ }
}

export class UnsupportedMedicalImageError extends Error {
  constructor() {
    super("Unsupported medical image");
    this.name = "UnsupportedMedicalImageError";
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/jpeg", 0.86));
}
