import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppointmentMail, buildDeadlineMail, getTokyoDate, isAllowedHttpUrl,
  isAppointmentNotificationTarget, isDeadlineNotificationTarget, notificationDeliveryId,
  type NotificationRecord,
} from "./notifications";

const base: NotificationRecord = {
  uid: "userA", medicalRecordId: "recordA", hasNextVisit: true,
  reservationDeadline: "2026-09-10", reservationStatus: "unbooked",
  appointmentDateTime: null, appointmentDateJst: null, hospitalName: "病院A", department: "精神科",
  reservationPhone: "03-1234-5678", hospitalUrl: "https://example.jp", reservationNote: "午前中に連絡",
  appointmentBelongings: "", appointmentNote: "",
};

test("日本時間の日付をUTC境界でも判定する", () => assert.equal(getTokyoDate(new Date("2026-09-09T15:30:00Z")), "2026-09-10"));
test("未予約の期限当日だけ期限通知対象になる", () => {
  assert.equal(isDeadlineNotificationTarget(base, "2026-09-10"), true);
  assert.equal(isDeadlineNotificationTarget({ ...base, reservationStatus: "booked" }, "2026-09-10"), false);
});
test("予約済みの予約日当日だけ予約通知対象になる", () => assert.equal(isAppointmentNotificationTarget({ ...base, reservationStatus: "booked", appointmentDateJst: "2026-09-20" }, "2026-09-20"), true));
test("任意項目が空ならメールに不要な行を含めない", () => {
  const mail = buildDeadlineMail({ ...base, hospitalName: "", reservationPhone: "", hospitalUrl: "", reservationNote: "" }, "https://app.example");
  assert.doesNotMatch(mail.text, /病院：|電話番号：|病院URL：|備考：/);
});
test("期限メールに連絡先と備考を含める", () => {
  const text = buildDeadlineMail(base, "https://app.example").text;
  assert.match(text, /03-1234-5678/); assert.match(text, /https:\/\/example.jp/); assert.match(text, /午前中に連絡/);
});
test("予約日メールに連絡先、持ち物、備考を含める", () => {
  const text = buildAppointmentMail({ ...base, reservationStatus: "booked", appointmentDateTime: "2026-09-20T09:30", appointmentDateJst: "2026-09-20", appointmentBelongings: "保険証", appointmentNote: "10分前に到着" }, "https://app.example").text;
  assert.match(text, /03-1234-5678/); assert.match(text, /保険証/); assert.match(text, /10分前に到着/);
});
test("同日でも記録IDごとに通知IDが異なる", () => assert.notEqual(notificationDeliveryId("u", "a", "appointment", "2026-09-20"), notificationDeliveryId("u", "b", "appointment", "2026-09-20")));
test("URLはhttpとhttpsだけを許可する", () => {
  assert.equal(isAllowedHttpUrl("https://example.jp"), true); assert.equal(isAllowedHttpUrl("http://example.jp"), true);
  assert.equal(isAllowedHttpUrl("javascript:alert(1)"), false); assert.equal(isAllowedHttpUrl("ftp://example.jp"), false);
});
