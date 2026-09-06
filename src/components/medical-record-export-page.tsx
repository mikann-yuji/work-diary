/* eslint-disable @next/next/no-img-element */
import type { StoredMedicalRecord, VisitMethod } from "@/types/medical-record";

export type MedicalExportAttachment = { id: string; label: string; url: string };
export type PreparedMedicalRecord = { record: StoredMedicalRecord; attachments: MedicalExportAttachment[] };

const densityStyles = [
  { fontSize: "9pt", gap: "3mm", padding: "2mm", imageHeight: "47mm", lineHeight: 1.4 },
  { fontSize: "8pt", gap: "2.2mm", padding: "1.5mm", imageHeight: "39mm", lineHeight: 1.3 },
  { fontSize: "7pt", gap: "1.5mm", padding: "1mm", imageHeight: "31mm", lineHeight: 1.2 },
  { fontSize: "6.5pt", gap: "1mm", padding: "0.8mm", imageHeight: "25mm", lineHeight: 1.14 },
] as const;

export const MEDICAL_EXPORT_DENSITY_LEVELS = densityStyles.length;

export function MedicalRecordExportPage({ prepared, density = 0 }: { prepared: PreparedMedicalRecord; density?: number }) {
  const { record, attachments } = prepared;
  const style = densityStyles[Math.min(density, densityStyles.length - 1)];
  const hasDetails = Boolean(record.background || record.diagnosis || record.prescription || record.memo);

  return <article data-medical-export-page style={{ width: "210mm", height: "297mm", boxSizing: "border-box", overflow: "hidden", background: "#fff", color: "#263238", padding: "9mm 10mm", fontFamily: '"Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif', fontSize: style.fontSize, lineHeight: style.lineHeight }}>
    <div data-medical-export-content style={{ display: "flex", height: "100%", flexDirection: "column", gap: style.gap, overflow: "visible", transformOrigin: "top left" }}>
      <header style={{ borderBottom: "2px solid #0f766e", paddingBottom: "2mm" }}>
        <h1 style={{ margin: 0, color: "#134e4a", fontSize: "16pt", lineHeight: 1.2 }}>通院記録</h1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1mm 5mm", marginTop: "2mm" }}>
          <ExportValue label="通院日" value={formatDate(record.visitDate)} />
          <ExportValue label="受診方法" value={visitMethodLabel(record.visitMethod)} />
          <ExportValue label="診療科" value={record.department || "-"} />
          <ExportValue label="病院名" value={record.hospitalName || "-"} />
        </div>
      </header>

      {record.symptomDuration ? <ExportSection title="基本情報"><TextRow label="症状の長さ" value={record.symptomDuration} padding={style.padding} /></ExportSection> : null}

      {hasDetails ? <ExportSection title="診療内容"><div style={{ border: "1px solid #b8c8c6" }}>
        <OptionalTextRow label="通院の経緯" value={record.background} padding={style.padding} />
        <OptionalTextRow label="診断" value={record.diagnosis} padding={style.padding} />
        <OptionalTextRow label="処方" value={record.prescription} padding={style.padding} />
        <OptionalTextRow label="メモ" value={record.memo} padding={style.padding} />
      </div></ExportSection> : null}

      <ExportSection title="次回通院・予約"><div style={{ border: "1px solid #b8c8c6" }}>
        <TextRow label="次回の通院" value={record.hasNextVisit === true ? "有" : record.hasNextVisit === false ? "無" : "未入力"} padding={style.padding} />
        {record.hasNextVisit ? <>
          <OptionalTextRow label="予約する期限" value={record.reservationDeadline ? formatDate(record.reservationDeadline) : ""} padding={style.padding} />
          <OptionalTextRow label="予約状況" value={record.reservationStatus === "booked" ? "予約済み" : record.reservationStatus === "unbooked" ? "未予約" : ""} padding={style.padding} />
          <OptionalTextRow label="予約用電話番号" value={record.reservationPhone} padding={style.padding} />
          <OptionalTextRow label="病院のURL" value={record.hospitalUrl} padding={style.padding} />
          <OptionalTextRow label="予約期限の備考" value={record.reservationNote} padding={style.padding} />
          {record.reservationStatus === "booked" ? <>
            <OptionalTextRow label="予約日時" value={record.appointmentDateTime ? formatDateTime(record.appointmentDateTime) : ""} padding={style.padding} />
            <OptionalTextRow label="持ち物" value={record.appointmentBelongings} padding={style.padding} />
            <OptionalTextRow label="予約日の備考" value={record.appointmentNote} padding={style.padding} />
          </> : null}
        </> : null}
      </div></ExportSection>

      {attachments.length ? <ExportSection title="添付画像"><div style={{ display: "grid", gridTemplateColumns: attachments.length === 1 ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "2mm" }}>
        {attachments.map((attachment) => <figure key={attachment.id} style={{ margin: 0, minWidth: 0, border: "1px solid #b8c8c6", padding: style.padding }}><figcaption style={{ marginBottom: "1mm", color: "#134e4a", fontWeight: 700 }}>{attachment.label}</figcaption>{/* Blob URL is created from an authenticated Firebase Storage download. */}<img src={attachment.url} alt={attachment.label} style={{ display: "block", width: "100%", height: style.imageHeight, objectFit: "contain", background: "#fff" }} /></figure>)}
      </div></ExportSection> : null}

      <footer style={{ marginTop: "auto", borderTop: "1px solid #b8c8c6", paddingTop: "1mm", textAlign: "right", color: "#536361", fontSize: "6.5pt" }}>仕事上の傾向と対策</footer>
    </div>
  </article>;
}

function ExportSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 style={{ margin: "0 0 1mm", color: "#134e4a", fontSize: "1.08em", lineHeight: 1.15 }}>{title}</h2>{children}</section>; }
function ExportValue({ label, value }: { label: string; value: string }) { return <div style={{ minWidth: 0 }}><span style={{ color: "#536361" }}>{label}：</span><strong style={{ overflowWrap: "anywhere" }}>{value}</strong></div>; }
function TextRow({ label, value, padding }: { label: string; value: string; padding: string }) { return <div style={{ display: "grid", gridTemplateColumns: "28mm 1fr", borderTop: "1px solid #d7e0df" }}><strong style={{ padding, background: "#f1f7f6" }}>{label}</strong><span style={{ padding, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</span></div>; }
function OptionalTextRow({ label, value, padding }: { label: string; value: string; padding: string }) { return value.trim() ? <TextRow label={label} value={value.trim()} padding={padding} /> : null; }
function formatDate(date: string) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function visitMethodLabel(value: VisitMethod | null) { if (value === "initial") return "初診"; if (value === "followUp") return "再診"; if (value === "online") return "オンライン"; return "未入力"; }
