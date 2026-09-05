import type { Timestamp } from "firebase/firestore";

export type VisitMethod = "initial" | "followUp" | "online";
export type ReservationStatus = "unbooked" | "booked" | null;
export type MedicalImageKind = "prescriptions" | "medication-guides";

export type MedicalImageReference = {
  id: string;
  path: string;
  contentType: "image/jpeg";
};

export type MedicalRecordInput = {
  visitDate: string;
  department: string;
  hospitalName: string;
  hasNextVisit: boolean | null;
  reservationDeadline: string | null;
  reservationStatus: ReservationStatus;
  appointmentDateTime: string | null;
  visitMethod: VisitMethod | null;
  background: string;
  symptomDuration: string;
  diagnosis: string;
  prescription: string;
  memo: string;
  prescriptionImages: MedicalImageReference[];
  medicationGuideImages: MedicalImageReference[];
};

export type StoredMedicalRecord = MedicalRecordInput & {
  id: string;
  medicalRecordId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  schemaVersion: number;
};
