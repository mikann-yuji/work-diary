"use client";

export type DraftKind = "work-record" | "medical-record";

export type DraftEntry<T = unknown> = {
  key: string;
  uid: string;
  kind: DraftKind;
  mode: "date" | "new" | "edit";
  targetId: string;
  payload: T;
  updatedAt: number;
};

export type DraftImageEntry = {
  key: string;
  uid: string;
  draftKey: string;
  imageId: string;
  kind: "prescriptions" | "medication-guides" | "diagnosis-results";
  blob: Blob;
};

const DB_NAME = "work-diary-drafts";
const DB_VERSION = 2;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("drafts")) {
        const drafts = database.createObjectStore("drafts", { keyPath: "key" });
        drafts.createIndex("uid", "uid");
        drafts.createIndex("uid-kind-mode", ["uid", "kind", "mode"]);
      }
      const images = database.objectStoreNames.contains("images")
        ? request.transaction!.objectStore("images")
        : database.createObjectStore("images", { keyPath: "key" });
      if (!images.indexNames.contains("draftKey")) images.createIndex("draftKey", "draftKey");
      if (!images.indexNames.contains("uid")) images.createIndex("uid", "uid");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(storeNames: string | string[], mode: IDBTransactionMode) {
  const database = await openDatabase();
  const tx = database.transaction(storeNames, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return { database, tx, done };
}

export async function getDraft<T>(key: string) {
  const { database, tx, done } = await transaction("drafts", "readonly");
  const value = await requestResult(tx.objectStore("drafts").get(key));
  await done;
  database.close();
  return value as DraftEntry<T> | undefined;
}

export async function putDraft<T>(draft: DraftEntry<T>) {
  const { database, tx, done } = await transaction("drafts", "readwrite");
  tx.objectStore("drafts").put(draft);
  await done;
  database.close();
}

export async function deleteDraft(key: string) {
  const { database, tx, done } = await transaction(["drafts", "images"], "readwrite");
  tx.objectStore("drafts").delete(key);
  const index = tx.objectStore("images").index("draftKey");
  const imageKeys = await requestResult(index.getAllKeys(key));
  imageKeys.forEach((imageKey) => tx.objectStore("images").delete(imageKey));
  await done;
  database.close();
}

export async function listNewMedicalDrafts<T>(uid: string) {
  const { database, tx, done } = await transaction("drafts", "readonly");
  const values = await requestResult(tx.objectStore("drafts").index("uid-kind-mode").getAll([uid, "medical-record", "new"]));
  await done;
  database.close();
  return (values as DraftEntry<T>[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function hasDraftsForUser(uid: string) {
  const { database, tx, done } = await transaction(["drafts", "images"], "readonly");
  const count = await requestResult(tx.objectStore("drafts").index("uid").count(uid));
  const imageCount = await requestResult(tx.objectStore("images").index("uid").count(uid));
  await done;
  database.close();
  return count > 0 || imageCount > 0;
}

export async function deleteDraftsForUser(uid: string) {
  const { database, tx, done } = await transaction(["drafts", "images"], "readwrite");
  const drafts = await requestResult(tx.objectStore("drafts").index("uid").getAll(uid)) as DraftEntry[];
  for (const draft of drafts) {
    tx.objectStore("drafts").delete(draft.key);
    const imageKeys = await requestResult(tx.objectStore("images").index("draftKey").getAllKeys(draft.key));
    imageKeys.forEach((imageKey) => tx.objectStore("images").delete(imageKey));
  }
  const remainingImageKeys = await requestResult(tx.objectStore("images").index("uid").getAllKeys(uid));
  remainingImageKeys.forEach((imageKey) => tx.objectStore("images").delete(imageKey));
  await done;
  database.close();
}

export async function putDraftImage(entry: Omit<DraftImageEntry, "key">) {
  const { database, tx, done } = await transaction("images", "readwrite");
  tx.objectStore("images").put({ ...entry, key: `${entry.draftKey}:${entry.imageId}` });
  await done;
  database.close();
}

export async function deleteDraftImage(draftKey: string, imageId: string) {
  const { database, tx, done } = await transaction("images", "readwrite");
  tx.objectStore("images").delete(`${draftKey}:${imageId}`);
  await done;
  database.close();
}

export async function getDraftImages(draftKey: string) {
  const { database, tx, done } = await transaction("images", "readonly");
  const values = await requestResult(tx.objectStore("images").index("draftKey").getAll(draftKey));
  await done;
  database.close();
  return values as DraftImageEntry[];
}
