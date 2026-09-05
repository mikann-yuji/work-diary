import "client-only";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type FirestoreError,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { createEmptyFutureMeasures, createEmptyTodayMeasures } from "@/constants/measure-options";
import type { FutureMeasure, TodayMedicationMeasure, WorkRecord } from "@/types/work-record";

export type RecordInput = Omit<WorkRecord, "id">;

export type StoredWorkRecord = WorkRecord & {
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  schemaVersion: number;
};

export type SaveRecordResult = { created: boolean };

function recordReference(uid: string, date: string) {
  return doc(firestore, "users", uid, "records", date);
}

function fromDocument(id: string, data: DocumentData): StoredWorkRecord {
  return {
    id,
    date: data.date,
    type: data.type,
    scheduledStart: data.scheduledStart,
    scheduledEnd: data.scheduledEnd,
    actualStart: data.actualStart,
    actualEnd: data.actualEnd,
    lostMinutes: data.lostMinutes,
    causes: data.causes,
    medication: data.medication,
    previousDay: data.previousDay,
    waking: data.waking,
    countermeasure: typeof data.countermeasure === "string" ? data.countermeasure : "",
    todayMeasures: normalizeTodayMeasures(data.todayMeasures),
    futureMeasures: normalizeFutureMeasures(data.futureMeasures),
    memo: typeof data.memo === "string" ? data.memo : "",
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
  };
}

export async function getRecordByDate(uid: string, date: string) {
  const snapshot = await getDoc(recordReference(uid, date));
  return snapshot.exists() ? fromDocument(snapshot.id, snapshot.data()) : null;
}

export async function saveOrUpdateRecord(
  uid: string,
  record: RecordInput,
): Promise<SaveRecordResult> {
  const reference = recordReference(uid, record.date);

  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const createdAt = snapshot.exists()
      ? snapshot.data().createdAt ?? serverTimestamp()
      : serverTimestamp();

    transaction.set(reference, {
      ...record,
      createdAt,
      updatedAt: serverTimestamp(),
      schemaVersion: 3,
    });

    return { created: !snapshot.exists() };
  });
}

function normalizeTodayMeasures(value: unknown) {
  const empty = createEmptyTodayMeasures();
  if (!isObject(value)) return empty;
  const medications = Array.isArray(value.medications) ? value.medications : [];
  const others = Array.isArray(value.others) ? value.others : [];
  return {
    medications: empty.medications.map((fallback, index) => {
      const item = medications[index];
      if (!isObject(item)) return fallback;
      return {
        detail: typeof item.detail === "string" ? item.detail : "",
        time: typeof item.time === "string" ? item.time : "",
      } satisfies TodayMedicationMeasure;
    }) as typeof empty.medications,
    others: empty.others.map((_, index) => typeof others[index] === "string" ? others[index] : "") as typeof empty.others,
  };
}

function normalizeFutureMeasures(value: unknown) {
  const empty = createEmptyFutureMeasures();
  const values = Array.isArray(value) ? value : [];
  return empty.map((fallback, index) => {
    const item = values[index];
    if (!isObject(item)) return fallback;
    const execution = item.execution;
    return {
      action: typeof item.action === "string" ? item.action : "",
      execution: execution === "done" || execution === "partial" || execution === "notDone" ? execution : null,
      result: typeof item.result === "string" ? item.result : "",
    } satisfies FutureMeasure;
  }) as typeof empty;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function subscribeRecords(
  uid: string,
  onRecords: (records: StoredWorkRecord[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  const recordsQuery = query(
    collection(firestore, "users", uid, "records"),
    orderBy("date", "desc"),
  );

  return onSnapshot(
    recordsQuery,
    (snapshot) => {
      onRecords(snapshot.docs.map((record) => fromDocument(record.id, record.data())));
    },
    onError,
  );
}

export async function deleteRecord(uid: string, date: string) {
  await deleteDoc(recordReference(uid, date));
}
