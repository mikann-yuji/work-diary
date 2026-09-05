import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import nodemailer from "nodemailer";
import {
  buildAppointmentMail, buildDeadlineMail, getTokyoDate,
  isAppointmentNotificationTarget, isDeadlineNotificationTarget,
  notificationDeliveryId, type NotificationRecord, type NotificationType,
} from "./notifications";

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const auth = getAuth();
const gmailUser = defineSecret("GMAIL_USER");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const appUrl = defineString("APP_URL", { default: "https://work-diary.vercel.app" });
const runtimeOptions = { region: "asia-northeast1" as const, secrets: [gmailUser, gmailAppPassword] };
const PROCESSING_LEASE_MS = 10 * 60 * 1000;

export const sendDailyMedicalNotifications = onSchedule({
  ...runtimeOptions,
  schedule: "0 8 * * *",
  timeZone: "Asia/Tokyo",
}, async () => {
  const today = getTokyoDate();
  const nextDay = nextCalendarDate(today);
  const [deadlineSnapshot, appointmentSnapshot, legacyAppointmentSnapshot] = await Promise.all([
    db.collectionGroup("medicalRecords")
      .where("hasNextVisit", "==", true)
      .where("reservationStatus", "==", "unbooked")
      .where("reservationDeadline", "==", today).get(),
    db.collectionGroup("medicalRecords")
      .where("hasNextVisit", "==", true)
      .where("reservationStatus", "==", "booked")
      .where("appointmentDateJst", "==", today).get(),
    db.collectionGroup("medicalRecords")
      .where("hasNextVisit", "==", true)
      .where("reservationStatus", "==", "booked")
      .where("appointmentDateTime", ">=", `${today}T00:00`)
      .where("appointmentDateTime", "<", `${nextDay}T00:00`).get(),
  ]);
  const transporter = createTransporter();
  const emailCache = new Map<string, string | null>();
  for (const snapshot of deadlineSnapshot.docs) {
    await processNotification(snapshot, "reservation-deadline", today, transporter, emailCache);
  }
  const appointmentDocs = new Map([...appointmentSnapshot.docs, ...legacyAppointmentSnapshot.docs].map((item) => [item.ref.path, item]));
  for (const snapshot of appointmentDocs.values()) {
    await processNotification(snapshot, "appointment", today, transporter, emailCache);
  }
  logger.info("Medical notification job completed", {
    deadlineCount: deadlineSnapshot.size,
    appointmentCount: appointmentDocs.size,
  });
});

// Authenticated callable for a developer/user to verify SMTP without accepting a recipient address.
export const sendMedicalNotificationTest = onCall(runtimeOptions, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const uid = request.auth.uid;
  const user = await auth.getUser(uid);
  if (!user.email) throw new HttpsError("failed-precondition", "The authenticated account has no email address.");
  try {
    await createTransporter().sendMail({
      from: gmailUser.value(),
      to: user.email,
      subject: "【通院記録】メール通知のテスト",
      text: `通院記録のメール通知テストです。\nこのメールが届けば通知設定は完了しています。\n${appUrl.value()}`,
    });
    return { sent: true };
  } catch (error) {
    logger.error("Medical notification test failed", { uid, errorType: classifyError(error) });
    throw new HttpsError("internal", "The test email could not be sent.");
  }
});

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser.value(), pass: gmailAppPassword.value() },
  });
}

async function processNotification(
  snapshot: DocumentSnapshot,
  type: NotificationType,
  targetDate: string,
  transporter: nodemailer.Transporter,
  emailCache: Map<string, string | null>,
) {
  const parsed = parseMedicalRecord(snapshot);
  if (!parsed) return;
  const { uid, medicalRecordId, record } = parsed;
  const eligible = type === "reservation-deadline"
    ? isDeadlineNotificationTarget(record, targetDate)
    : isAppointmentNotificationTarget(record, targetDate);
  if (!eligible) return;
  const deliveryId = notificationDeliveryId(uid, medicalRecordId, type, targetDate);
  if (!await claimDelivery(deliveryId, uid, medicalRecordId, type, targetDate)) return;
  try {
    let email = emailCache.get(uid);
    if (email === undefined) {
      email = (await auth.getUser(uid)).email ?? null;
      emailCache.set(uid, email);
    }
    if (!email) throw new NotificationError("missing-email");
    const mail = type === "reservation-deadline"
      ? buildDeadlineMail(record, appUrl.value())
      : buildAppointmentMail(record, appUrl.value());
    await transporter.sendMail({ from: gmailUser.value(), to: email, ...mail });
    await db.collection("notificationDeliveries").doc(deliveryId).update({
      status: "sent", sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), errorType: null,
    });
  } catch (error) {
    const errorType = classifyError(error);
    await db.collection("notificationDeliveries").doc(deliveryId).update({
      status: "failed", updatedAt: FieldValue.serverTimestamp(), errorType,
    });
    logger.error("Medical notification failed", { uid, errorType });
  }
}

function parseMedicalRecord(snapshot: DocumentSnapshot): { uid: string; medicalRecordId: string; record: NotificationRecord } | null {
  const segments = snapshot.ref.path.split("/");
  if (segments.length !== 4 || segments[0] !== "users" || segments[2] !== "medicalRecords") return null;
  const uid = segments[1];
  const medicalRecordId = segments[3];
  const data = snapshot.data() as Partial<NotificationRecord> | undefined;
  if (!data || (data.uid !== undefined && data.uid !== uid) || data.medicalRecordId !== medicalRecordId) {
    logger.warn("Medical record ownership validation failed", { uid, errorType: "ownership-mismatch" });
    return null;
  }
  return {
    uid, medicalRecordId,
    record: {
      uid, medicalRecordId,
      hasNextVisit: data.hasNextVisit === true,
      reservationDeadline: typeof data.reservationDeadline === "string" ? data.reservationDeadline : null,
      reservationStatus: data.reservationStatus === "unbooked" || data.reservationStatus === "booked" ? data.reservationStatus : null,
      appointmentDateTime: typeof data.appointmentDateTime === "string" ? data.appointmentDateTime : null,
      appointmentDateJst: typeof data.appointmentDateJst === "string" ? data.appointmentDateJst : (typeof data.appointmentDateTime === "string" ? data.appointmentDateTime.slice(0, 10) : null),
      hospitalName: stringValue(data.hospitalName), department: stringValue(data.department),
      reservationPhone: stringValue(data.reservationPhone), hospitalUrl: stringValue(data.hospitalUrl),
      reservationNote: stringValue(data.reservationNote), appointmentBelongings: stringValue(data.appointmentBelongings),
      appointmentNote: stringValue(data.appointmentNote),
    },
  };
}

async function claimDelivery(id: string, uid: string, medicalRecordId: string, type: NotificationType, targetDate: string) {
  const reference = db.collection("notificationDeliveries").doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    if (data?.status === "sent") return false;
    const updatedAt = data?.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0;
    if (data?.status === "processing" && Date.now() - updatedAt < PROCESSING_LEASE_MS) return false;
    transaction.set(reference, {
      uid, medicalRecordId, notificationType: type, targetDate,
      status: "processing", attemptCount: (typeof data?.attemptCount === "number" ? data.attemptCount : 0) + 1,
      createdAt: data?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      sentAt: data?.sentAt ?? null, errorType: null,
    });
    return true;
  });
}

function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function nextCalendarDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
class NotificationError extends Error { constructor(readonly kind: string) { super(kind); } }
function classifyError(error: unknown) {
  if (error instanceof NotificationError) return error.kind;
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") return error.code.slice(0, 80);
  return "unknown";
}
