"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { MedicalRecordInput, StoredMedicalRecord } from "@/types/medical-record";

export function createMedicalRecordId(uid: string) {
  return doc(collection(firestore, "users", uid, "medicalRecords")).id;
}

export async function saveMedicalRecord(uid: string, recordId: string, input: MedicalRecordInput) {
  const reference = doc(firestore, "users", uid, "medicalRecords", recordId);
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(reference);
    transaction.set(reference, {
      ...input,
      medicalRecordId: recordId,
      createdAt: snapshot.exists() ? snapshot.data().createdAt ?? serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    return { created: !snapshot.exists() };
  });
}

export function deleteMedicalRecord(uid: string, medicalRecordId: string) {
  return deleteDoc(doc(firestore, "users", uid, "medicalRecords", medicalRecordId));
}

export function subscribeMedicalRecords(
  uid: string,
  onRecords: (records: StoredMedicalRecord[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  const recordsQuery = query(collection(firestore, "users", uid, "medicalRecords"), orderBy("visitDate", "desc"));
  return onSnapshot(recordsQuery, (snapshot) => {
    onRecords(snapshot.docs.map((item) => fromDocument(item.id, item.data())));
  }, onError);
}

function fromDocument(id: string, data: DocumentData): StoredMedicalRecord {
  return {
    id,
    medicalRecordId: typeof data.medicalRecordId === "string" ? data.medicalRecordId : id,
    visitDate: typeof data.visitDate === "string" ? data.visitDate : "",
    department: typeof data.department === "string" ? data.department : "",
    hospitalName: typeof data.hospitalName === "string" ? data.hospitalName : "",
    hasNextVisit: typeof data.hasNextVisit === "boolean" ? data.hasNextVisit : null,
    reservationDeadline: typeof data.reservationDeadline === "string" ? data.reservationDeadline : null,
    reservationStatus: data.reservationStatus === "unbooked" || data.reservationStatus === "booked" ? data.reservationStatus : null,
    appointmentDateTime: typeof data.appointmentDateTime === "string" ? data.appointmentDateTime : null,
    visitMethod: data.visitMethod === "initial" || data.visitMethod === "followUp" || data.visitMethod === "online" ? data.visitMethod : null,
    background: typeof data.background === "string" ? data.background : "",
    symptomDuration: typeof data.symptomDuration === "string" ? data.symptomDuration : "",
    diagnosis: typeof data.diagnosis === "string" ? data.diagnosis : "",
    prescription: typeof data.prescription === "string" ? data.prescription : "",
    memo: typeof data.memo === "string" ? data.memo : "",
    prescriptionImages: normalizeImages(data.prescriptionImages),
    medicationGuideImages: normalizeImages(data.medicationGuideImages),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
  };
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.path !== "string") return [];
    return [{ id: candidate.id, path: candidate.path, contentType: "image/jpeg" as const }];
  }).slice(0, 2);
}
