import type { Timestamp } from "firebase/firestore";

export type VisitMethod = "initial" | "followUp" | "online";
export type ReservationStatus = "unbooked" | "booked" | null;
export type MedicalImageKind = "prescriptions" | "medication-guides" | "diagnosis-results";

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
  reservationPhone: string;
  hospitalUrl: string;
  reservationNote: string;
  appointmentDateTime: string | null;
  appointmentDateJst: string | null;
  appointmentBelongings: string;
  appointmentNote: string;
  visitMethod: VisitMethod | null;
  background: string;
  symptomDuration: string;
  diagnosis: string;
  prescription: string;
  memo: string;
  prescriptionImages: MedicalImageReference[];
  medicationGuideImages: MedicalImageReference[];
  diagnosisResultImages: MedicalImageReference[];
};

export type StoredMedicalRecord = MedicalRecordInput & {
  id: string;
  uid: string;
  medicalRecordId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  schemaVersion: number;
};
