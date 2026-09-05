"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/lib/firebase/client";

export async function sendMedicalNotificationTest() {
  const callable = httpsCallable<void, { sent: boolean }>(
    getFunctions(firebaseApp, "asia-northeast1"),
    "sendMedicalNotificationTest",
  );
  const result = await callable();
  return result.data.sent;
}
