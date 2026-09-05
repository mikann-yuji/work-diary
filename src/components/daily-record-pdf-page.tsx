import { causeCategories, OTHER_CAUSE_ID } from "@/constants/cause-options";
import { medicationPeriods, sleepDepthLabels } from "@/constants/wellness-options";
import { futureMeasureExecutionLabels } from "@/constants/measure-options";
import { formatDuration } from "@/lib/work-time";
import { attendanceLabels, type MedicationStatus } from "@/types/work-record";
import type { StoredWorkRecord } from "@/lib/firestore/records";

const densityStyles = [
  { fontSize: "9pt", gap: "3.2mm", cellPadding: "2.1mm", lineHeight: 1.42 },
  { fontSize: "8.5pt", gap: "2.5mm", cellPadding: "1.7mm", lineHeight: 1.34 },
  { fontSize: "7.5pt", gap: "1.8mm", cellPadding: "1.3mm", lineHeight: 1.27 },
  { fontSize: "6.5pt", gap: "1.2mm", cellPadding: "0.9mm", lineHeight: 1.18 },
] as const;

export const PDF_DENSITY_LEVELS = densityStyles.length;

export function DailyRecordPdfPage({ record, density }: { record: StoredWorkRecord; density: number }) {
  const style = densityStyles[Math.min(density, densityStyles.length - 1)];
  const todayMedications = record.todayMeasures.medications.filter((item) => item.detail || item.time);
  const todayOthers = record.todayMeasures.others.filter(Boolean);
  const futureMeasures = record.futureMeasures.filter((item) => item.action || item.execution || item.result);

  return (
    <article
      data-pdf-page
      style={{
        width: "210mm",
        height: "297mm",
        boxSizing: "border-box",
        overflow: "hidden",
        background: "#ffffff",
        color: "#263238",
        padding: "9mm 10mm",
        fontFamily: '"Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif',
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      }}
    >
      <div data-pdf-content style={{ display: "flex", height: "100%", flexDirection: "column", gap: style.gap, overflow: "visible" }}>
        <header style={{ borderBottom: "2px solid #0f766e", paddingBottom: "2.2mm" }}>
          <h1 style={{ margin: 0, color: "#134e4a", fontSize: "16pt", lineHeight: 1.2 }}>仕事上の傾向と対策シート</h1>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4mm", marginTop: "2mm", fontWeight: 700 }}>
            <span>{formatPdfDate(record.date)}</span>
            <span style={{ border: "1px solid #0f766e", padding: "0.8mm 3mm", color: "#134e4a" }}>{attendanceLabels[record.type]}</span>
          </div>
        </header>

        <PdfSection title="勤務時間" padding={style.cellPadding}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: "1px solid #b8c8c6" }}>
            <PdfValue label="本来の開始" value={record.type === "holiday" || record.type === "plannedHoliday" ? "-" : record.scheduledStart} padding={style.cellPadding} />
            <PdfValue label="本来の終了" value={record.type === "holiday" || record.type === "plannedHoliday" ? "-" : record.scheduledEnd} padding={style.cellPadding} />
            <PdfValue label="実際の開始" value={record.type === "absent" || record.type === "holiday" || record.type === "plannedHoliday" ? "-" : record.actualStart || "-"} padding={style.cellPadding} />
            <PdfValue label="実際の終了" value={record.type === "absent" || record.type === "holiday" || record.type === "plannedHoliday" ? "-" : record.actualEnd || "-"} padding={style.cellPadding} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #b8c8c6", borderTop: 0 }}>
            <PdfValue label="失った時間" value={formatDuration(record.lostMinutes)} padding={style.cellPadding} />
            <PdfValue label="失った時間（合計分）" value={`${record.lostMinutes}分`} padding={style.cellPadding} />
          </div>
        </PdfSection>

        <PdfSection title="原因" padding={style.cellPadding}>
          <div style={{ border: "1px solid #b8c8c6" }}>
            {causeCategories.map((category, index) => {
              const selection = record.causes[category.id];
              return (
                <div key={category.id} style={{ display: "grid", gridTemplateColumns: "22mm 1fr", borderTop: index === 0 ? 0 : "1px solid #d7e0df" }}>
                  <strong style={{ background: "#f1f7f6", padding: style.cellPadding }}>{category.label}</strong>
                  <div style={{ padding: style.cellPadding, overflowWrap: "anywhere" }}>
                    {category.options.map((option) => {
                      const selected = selection.selectedOptionIds.includes(option.id);
                      return <span key={option.id} style={{ display: "inline-block", marginRight: "2.5mm", whiteSpace: "nowrap" }}><CheckBox selected={selected} /> {option.label}</span>;
                    })}
                    {selection.selectedOptionIds.includes(OTHER_CAUSE_ID) ? <div style={{ marginTop: "0.7mm" }}>その他の内容：{selection.otherText.trim() || "-"}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </PdfSection>

        <PdfSection title="服薬" padding={style.cellPadding}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: "1px solid #b8c8c6" }}>
            {medicationPeriods.map((period) => {
              const medication = record.medication[period.id];
              return <div key={period.id} style={{ minWidth: 0, padding: style.cellPadding, borderLeft: period.id === "morning" ? 0 : "1px solid #d7e0df" }}><strong style={{ color: "#134e4a" }}>{period.label}：{formatMedicationStatus(medication.status)}</strong><div style={{ marginTop: "0.7mm", overflowWrap: "anywhere" }}>{medication.note.trim() || "-"}</div></div>;
            })}
          </div>
        </PdfSection>

        <PdfSection title="前日の状態" padding={style.cellPadding}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid #b8c8c6" }}>
            <PdfValue label="睡眠時間" value={valueOr(record.previousDay.sleepHours, "時間")} padding={style.cellPadding} />
            <PdfValue label="中途覚醒" value={valueOr(record.previousDay.awakenings, "回")} padding={style.cellPadding} />
            <PdfValue label="眠りの深さ" value={record.previousDay.sleepDepth === null ? "未入力" : sleepDepthLabels[record.previousDay.sleepDepth]} padding={style.cellPadding} />
            <PdfValue label="帰宅後の疲労" value={rating(record.previousDay.fatigueAfterReturningHome)} padding={style.cellPadding} />
            <PdfValue label="前日の外出" value={record.previousDay.wentOut === null ? "未入力" : record.previousDay.wentOut ? "有" : "無"} padding={style.cellPadding} />
            <PdfValue label="外出の負荷" value={rating(record.previousDay.outingLoad)} padding={style.cellPadding} />
          </div>
        </PdfSection>

        <PdfSection title="起床時の状態" padding={style.cellPadding}>
          <div style={{ display: "grid", gridTemplateColumns: "35mm 1fr", border: "1px solid #b8c8c6" }}>
            <PdfValue label="起床時の眠気" value={rating(record.waking.sleepiness)} padding={style.cellPadding} />
            <PdfValue label="起床時の体調" value={record.waking.conditionNote.trim() || "-"} padding={style.cellPadding} />
          </div>
        </PdfSection>

        <PdfSection title="対策" padding={style.cellPadding}>
          <PdfText value={record.countermeasure} padding={style.cellPadding} />
        </PdfSection>

        <PdfSection title="当日の対策" padding={style.cellPadding}>
          {todayMedications.length || todayOthers.length ? <div style={{ border: "1px solid #b8c8c6" }}>
            {todayMedications.map((item, index) => <div key={`medication-${index}`} style={{ display: "grid", gridTemplateColumns: "18mm 1fr 22mm", borderTop: index === 0 ? 0 : "1px solid #d7e0df" }}><strong style={{ padding: style.cellPadding, background: "#f1f7f6" }}>服薬 {index + 1}</strong><span style={{ padding: style.cellPadding, overflowWrap: "anywhere" }}>{item.detail || "-"}</span><span style={{ padding: style.cellPadding, borderLeft: "1px solid #d7e0df" }}>{item.time || "-"}</span></div>)}
            {todayOthers.map((item, index) => <div key={`other-${index}`} style={{ display: "grid", gridTemplateColumns: "18mm 1fr", borderTop: "1px solid #d7e0df" }}><strong style={{ padding: style.cellPadding, background: "#f1f7f6" }}>その他 {index + 1}</strong><span style={{ padding: style.cellPadding, overflowWrap: "anywhere" }}>{item}</span></div>)}
          </div> : <PdfText value="" padding={style.cellPadding} />}
        </PdfSection>

        <PdfSection title="今後の対策" padding={style.cellPadding}>
          {futureMeasures.length ? <div style={{ border: "1px solid #b8c8c6" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 14mm 1fr", background: "#f1f7f6", fontWeight: 700 }}><span style={{ padding: style.cellPadding }}>今後の対策</span><span style={{ padding: style.cellPadding, borderLeft: "1px solid #d7e0df" }}>実行</span><span style={{ padding: style.cellPadding, borderLeft: "1px solid #d7e0df" }}>結果</span></div>
            {futureMeasures.map((item, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 14mm 1fr", borderTop: "1px solid #d7e0df" }}><span style={{ padding: style.cellPadding, overflowWrap: "anywhere" }}>{item.action || "-"}</span><span style={{ padding: style.cellPadding, borderLeft: "1px solid #d7e0df", textAlign: "center" }}>{item.execution ? futureMeasureExecutionLabels[item.execution] : "-"}</span><span style={{ padding: style.cellPadding, borderLeft: "1px solid #d7e0df", overflowWrap: "anywhere" }}>{item.result || "-"}</span></div>)}
          </div> : <PdfText value="" padding={style.cellPadding} />}
        </PdfSection>

        <PdfSection title="メモ" padding={style.cellPadding}>
          <PdfText value={record.memo} padding={style.cellPadding} />
        </PdfSection>

        <footer style={{ marginTop: "auto", borderTop: "1px solid #b8c8c6", paddingTop: "1.3mm", textAlign: "right", color: "#536361", fontSize: "6.5pt" }}>仕事上の傾向と対策</footer>
      </div>
    </article>
  );
}

function PdfText({ value, padding }: { value: string; padding: string }) {
  return <div style={{ minHeight: "5mm", border: "1px solid #b8c8c6", padding, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value.trim() || "-"}</div>;
}

function PdfSection({ title, padding, children }: { title: string; padding: string; children: React.ReactNode }) {
  return <section><h2 style={{ margin: `0 0 ${padding}`, color: "#134e4a", fontSize: "1.08em", lineHeight: 1.15 }}>{title}</h2>{children}</section>;
}

function PdfValue({ label, value, padding }: { label: string; value: string; padding: string }) {
  return <div style={{ minWidth: 0, padding, borderLeft: "1px solid #d7e0df", overflowWrap: "anywhere" }}><div style={{ color: "#465957", fontSize: "0.86em" }}>{label}</div><div style={{ marginTop: "0.5mm", fontWeight: 700 }}>{value}</div></div>;
}

function CheckBox({ selected }: { selected: boolean }) {
  return <span aria-hidden="true" style={{ display: "inline-flex", width: "2.7mm", height: "2.7mm", alignItems: "center", justifyContent: "center", border: "1px solid #536361", background: selected ? "#0f766e" : "#fff", color: "#fff", fontSize: "6pt", lineHeight: 1 }}>{selected ? "✓" : ""}</span>;
}

function formatPdfDate(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatMedicationStatus(status: MedicationStatus) {
  if (status === "taken") return "有";
  if (status === "not_taken") return "無";
  return "未入力";
}

function valueOr(value: number | null, suffix: string) {
  return value === null ? "未入力" : `${value}${suffix}`;
}

function rating(value: number | null) {
  return value === null ? "未入力" : `${value} / 5`;
}
