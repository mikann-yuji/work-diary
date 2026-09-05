export type ReservationStatus = "unbooked" | "booked" | null;
export type NotificationType = "reservation-deadline" | "appointment";

export type NotificationRecord = {
  uid: string;
  medicalRecordId: string;
  hasNextVisit: boolean;
  reservationDeadline: string | null;
  reservationStatus: ReservationStatus;
  appointmentDateTime: string | null;
  appointmentDateJst: string | null;
  hospitalName: string;
  department: string;
  reservationPhone: string;
  hospitalUrl: string;
  reservationNote: string;
  appointmentBelongings: string;
  appointmentNote: string;
};

export function getTokyoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isAllowedHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isDeadlineNotificationTarget(record: NotificationRecord, today: string): boolean {
  return record.hasNextVisit && record.reservationStatus === "unbooked" && record.reservationDeadline === today;
}

export function isAppointmentNotificationTarget(record: NotificationRecord, today: string): boolean {
  return record.hasNextVisit && record.reservationStatus === "booked" && record.appointmentDateJst === today;
}

export function notificationDeliveryId(uid: string, medicalRecordId: string, type: NotificationType, targetDate: string): string {
  return `${uid}_${medicalRecordId}_${type}_${targetDate}`;
}

function optionalLine(label: string, value: string): string[] {
  return value.trim() ? [`${label}：${value.trim()}`] : [];
}

function optionalSection(label: string, value: string): string[] {
  return value.trim() ? [label, value.trim()] : [];
}

export function buildDeadlineMail(record: NotificationRecord, appUrl: string) {
  const lines = [
    "本日は通院予約の期限です。",
    ...optionalLine("病院", record.hospitalName),
    ...optionalLine("診療科", record.department),
    ...optionalLine("予約期限", record.reservationDeadline ?? ""),
    ...optionalLine("電話番号", record.reservationPhone),
    ...(isAllowedHttpUrl(record.hospitalUrl) ? optionalLine("病院URL", record.hospitalUrl) : []),
    ...optionalSection("備考：", record.reservationNote),
    "アプリを開いて予約状況を確認してください。",
    appUrl,
  ];
  return { subject: "【通院記録】本日は予約期限です", text: lines.join("\n") };
}

export function formatAppointmentJst(value: string): string {
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export function buildAppointmentMail(record: NotificationRecord, appUrl: string) {
  const lines = [
    "本日は予約している通院日です。",
    ...optionalLine("病院", record.hospitalName),
    ...optionalLine("診療科", record.department),
    ...optionalLine("予約日時", record.appointmentDateTime ? formatAppointmentJst(record.appointmentDateTime) : ""),
    ...optionalLine("電話番号", record.reservationPhone),
    ...(isAllowedHttpUrl(record.hospitalUrl) ? optionalLine("病院URL", record.hospitalUrl) : []),
    ...optionalSection("持ち物：", record.appointmentBelongings),
    ...optionalSection("備考：", record.appointmentNote),
    "予約時刻と持ち物を確認してください。",
    appUrl,
  ];
  return { subject: "【通院記録】本日は通院予定日です", text: lines.join("\n") };
}
