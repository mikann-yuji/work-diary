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
import type { WorkRecord } from "@/types/work-record";

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
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    schemaVersion: data.schemaVersion,
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
      schemaVersion: 1,
    });

    return { created: !snapshot.exists() };
  });
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
