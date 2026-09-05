"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCauseDisplayLabels } from "@/constants/cause-options";
import {
  createCalendarDays,
  getCurrentMonth,
  getLocalDateString,
  shiftMonth,
  summarizeMonth,
  type CalendarMonth,
} from "@/lib/calendar";
import { formatDuration } from "@/lib/work-time";
import { attendanceLabels, type AttendanceType } from "@/types/work-record";
import type { StoredWorkRecord } from "@/lib/firestore/records";
import type { StoredMedicalRecord } from "@/types/medical-record";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ImagePreviewDialog, type PreviewRecordImage } from "@/components/image-preview-dialog";

type RecordsState = "loading" | "empty" | "success" | "error";
type MedicalEvent = { type: "visit" | "deadline" | "appointment"; record: StoredMedicalRecord };

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const shortAttendanceLabels: Record<AttendanceType, string> = {
  present: "出",
  late: "遅",
  early: "早",
  absent: "欠",
  holiday: "休",
  plannedHoliday: "計",
};
const attendanceStyles: Record<AttendanceType, string> = {
  present: "border-teal-600 bg-teal-600 text-white",
  late: "border-orange-500 bg-orange-500 text-white",
  early: "border-indigo-500 bg-indigo-500 text-white",
  absent: "border-rose-600 bg-rose-600 text-white",
  holiday: "border-slate-500 bg-slate-500 text-white",
  plannedHoliday: "border-sky-500 bg-sky-500 text-white",
};

export function MonthlyCalendar({
  recordsByDate,
  medicalRecords,
  recordsState,
  onEdit,
  onCreate,
  onOpenMedical,
  onToast,
}: {
  recordsByDate: ReadonlyMap<string, StoredWorkRecord>;
  medicalRecords: StoredMedicalRecord[];
  recordsState: RecordsState;
  onEdit: (record: StoredWorkRecord) => void;
  onCreate: (date: string) => void;
  onOpenMedical: (recordId: string) => void;
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const generatingRef = useRef(false);
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(getCurrentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(getLocalDateString);
  const [exportMode, setExportMode] = useState(false);
  const [exportDates, setExportDates] = useState<Set<string>>(() => new Set());
  const [generating, setGenerating] = useState<"pdf" | "image" | null>(null);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [previewImages, setPreviewImages] = useState<PreviewRecordImage[] | null>(null);
  const today = useMemo(() => getLocalDateString(), []);
  const calendarDays = useMemo(() => createCalendarDays(visibleMonth), [visibleMonth]);
  const summary = useMemo(
    () => summarizeMonth(recordsByDate.values(), visibleMonth),
    [recordsByDate, visibleMonth],
  );
  const medicalEventsByDate = useMemo(() => {
    const map = new Map<string, MedicalEvent[]>();
    const add = (date: string | null, event: MedicalEvent) => {
      if (!date) return;
      map.set(date, [...(map.get(date) ?? []), event]);
    };
    medicalRecords.forEach((record) => {
      add(record.visitDate, { type: "visit", record });
      if (record.hasNextVisit) add(record.reservationDeadline, { type: "deadline", record });
      if (record.hasNextVisit && record.reservationStatus === "booked") add(record.appointmentDateJst ?? record.appointmentDateTime?.slice(0, 10) ?? null, { type: "appointment", record });
    });
    map.forEach((events) => events.sort((a, b) => {
      if (a.type === "appointment" && b.type === "appointment") return (a.record.appointmentDateTime ?? "").localeCompare(b.record.appointmentDateTime ?? "");
      return 0;
    }));
    return map;
  }, [medicalRecords]);
  const selectedRecord = selectedDate ? recordsByDate.get(selectedDate) ?? null : null;
  const selectedDateInMonth = selectedDate?.startsWith(
    `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, "0")}-`,
  ) ?? false;
  const closeImagePreview = useCallback(() => {
    setPreviewImages(null);
    setExportDates(new Set());
    setExportMode(false);
  }, []);
  useEffect(() => () => {
    previewImages?.forEach((image) => URL.revokeObjectURL(image.url));
  }, [previewImages]);

  function moveMonth(amount: number) {
    if (generating) return;
    if (exportMode && exportDates.size > 0) {
      const approved = window.confirm("選択中の日付が解除されます。月を移動しますか？");
      if (!approved) return;
      setExportDates(new Set());
      setExportMode(false);
    }
    setVisibleMonth((current) => shiftMonth(current, amount));
    setSelectedDate(null);
  }

  function toggleExportDate(date: string) {
    if (generating || !recordsByDate.has(date)) return;
    setExportDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function selectAllRecordedDays() {
    const prefix = `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, "0")}-`;
    setExportDates(new Set([...recordsByDate.keys()].filter((date) => date.startsWith(prefix))));
  }

  function cancelExportMode() {
    if (generating) return;
    setExportDates(new Set());
    setExportMode(false);
  }

  async function createPdf() {
    if (generatingRef.current) return;
    const selectedRecords = [...exportDates]
      .map((date) => recordsByDate.get(date))
      .filter((record): record is StoredWorkRecord => record !== undefined);
    if (selectedRecords.length === 0) {
      onToast("PDF化する日付を選択してください", "error");
      return;
    }

    generatingRef.current = true;
    setGenerating("pdf");
    setExportProgress({ current: 0, total: selectedRecords.length });
    onToast("PDFを作成しています", "success");

    try {
      const { generateRecordsPdf } = await import("@/lib/pdf/generate-records-pdf");
      await generateRecordsPdf(selectedRecords, (current, total) => setExportProgress({ current, total }));
      setExportDates(new Set());
      setExportMode(false);
      onToast("PDFを保存しました", "success");
    } catch (error) {
      if (isRecordOverflowError(error)) {
        const [, month, day] = error.date.split("-").map(Number);
        onToast(`${month}月${day}日の記録は内容が多いため、A4一枚に収まりません。入力内容を短くしてから、もう一度お試しください`, "error");
      } else {
        onToast("PDFを作成できませんでした。もう一度お試しください", "error");
      }
    } finally {
      generatingRef.current = false;
      setGenerating(null);
    }
  }

  async function createImages() {
    if (generatingRef.current) return;
    const selectedRecords = [...exportDates]
      .map((date) => recordsByDate.get(date))
      .filter((record): record is StoredWorkRecord => record !== undefined);
    if (selectedRecords.length === 0) {
      onToast("画像にする日付を選択してください", "error");
      return;
    }

    generatingRef.current = true;
    setGenerating("image");
    setExportProgress({ current: 0, total: selectedRecords.length });

    try {
      const { generateRecordImages } = await import("@/lib/image/generate-record-images");
      const images = await generateRecordImages(selectedRecords, (current, total) => setExportProgress({ current, total }));
      setPreviewImages(images.map(({ date, blob }) => ({
        date,
        blob,
        url: URL.createObjectURL(blob),
        file: new File([blob], `work-diary_${date}.png`, { type: "image/png" }),
      })));
      onToast("画像を作成しました", "success");
    } catch (error) {
      if (isRecordOverflowError(error)) {
        const [, month, day] = error.date.split("-").map(Number);
        onToast(`${month}月${day}日の記録は内容が多いため、A4一枚に収まりません。入力内容を短くしてから、もう一度お試しください`, "error");
      } else {
        onToast("画像を作成できませんでした。もう一度お試しください", "error");
      }
    } finally {
      generatingRef.current = false;
      setGenerating(null);
    }
  }

  return (
    <div className="min-h-[520px] bg-slate-50/50 p-4 sm:p-5">
      {recordsState === "error" ? <DataError /> : null}
      {recordsState === "loading" ? (
        <LoadingSpinner className="min-h-[420px]" />
      ) : (
        <div className="space-y-5">
          <MonthlySummary month={visibleMonth} summary={summary} />

          <section className="rounded-[22px] border border-slate-100 bg-white p-3 shadow-sm shadow-slate-200/40 sm:p-4" aria-label={`${visibleMonth.year}年${visibleMonth.month}月の勤務状況カレンダー`}>
            <div className="mb-4 flex justify-end">
              <button type="button" aria-pressed={exportMode} onClick={() => exportMode ? cancelExportMode() : setExportMode(true)} disabled={Boolean(generating)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold transition disabled:opacity-50 ${exportMode ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-800 hover:bg-teal-50"}`}>{exportMode ? "出力する日を選択中" : "記録を出力"}</button>
            </div>
            <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
              <button type="button" aria-label="前の月を表示" onClick={() => moveMonth(-1)} disabled={Boolean(generating)} className="min-h-11 rounded-xl border border-slate-200 text-xl font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-40">‹</button>
              <h2 className="text-center text-lg font-bold text-slate-800">{visibleMonth.year}年{visibleMonth.month}月</h2>
              <button type="button" aria-label="次の月を表示" onClick={() => moveMonth(1)} disabled={Boolean(generating)} className="min-h-11 rounded-xl border border-slate-200 text-xl font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-40">›</button>
            </div>

            {exportMode ? (
              <PdfExportControls
                selectedCount={exportDates.size}
                generating={generating}
                progress={exportProgress}
                onSelectAll={selectAllRecordedDays}
                onClear={() => setExportDates(new Set())}
                onGeneratePdf={() => void createPdf()}
                onGenerateImages={() => void createImages()}
                onCancel={cancelExportMode}
              />
            ) : null}

            <CalendarLegend />
            <MedicalCalendarLegend />

            <div className="mt-4 grid grid-cols-7 gap-1">
              {weekdays.map((weekday, index) => (
                <div key={weekday} className={`py-1 text-center text-xs font-bold ${index === 0 ? "text-rose-500" : index === 6 ? "text-blue-500" : "text-slate-500"}`}>{weekday}</div>
              ))}
              {calendarDays.map((date, index) => date ? (
                <CalendarDay
                  key={date}
                  date={date}
                  weekday={index % 7}
                  record={recordsByDate.get(date)}
                  medicalEvents={medicalEventsByDate.get(date) ?? []}
                  selected={!exportMode && selectedDate === date}
                  pdfMode={exportMode}
                  pdfSelected={exportDates.has(date)}
                  generating={Boolean(generating)}
                  today={date === today}
                  onSelect={() => exportMode ? toggleExportDate(date) : setSelectedDate(date)}
                />
              ) : <div key={`empty-${index}`} aria-hidden="true" className="min-h-14" />)}
            </div>
          </section>

          {!exportMode && selectedDate && selectedDateInMonth ? (
            <SelectedDaySummary
              date={selectedDate}
              record={selectedRecord}
              medicalEvents={medicalEventsByDate.get(selectedDate) ?? []}
              onEdit={() => selectedRecord && onEdit(selectedRecord)}
              onCreate={() => onCreate(selectedDate)}
              onOpenMedical={onOpenMedical}
            />
          ) : null}
        </div>
      )}
      {previewImages ? <ImagePreviewDialog images={previewImages} onClose={closeImagePreview} onToast={onToast} /> : null}
    </div>
  );
}

function MonthlySummary({ month, summary }: { month: CalendarMonth; summary: ReturnType<typeof summarizeMonth> }) {
  const items = [
    ["記録日数", `${summary.recordCount}日`],
    ["通常出勤", `${summary.attendanceCounts.present}日`],
    ["遅刻", `${summary.attendanceCounts.late}日`],
    ["早退", `${summary.attendanceCounts.early}日`],
    ["欠勤", `${summary.attendanceCounts.absent}日`],
  ] as const;

  return (
    <section className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h2 className="text-lg font-bold text-slate-800">{month.year}年{month.month}月のサマリー</h2>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(([label, value]) => <SummaryItem key={label} label={label} value={value} />)}
        <SummaryItem label="失った時間の合計" value={formatSummaryDuration(summary.lostMinutes)} wide />
      </dl>
      {summary.recordCount === 0 ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">この月の記録はまだありません</p> : null}
    </section>
  );
}

function SummaryItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-xl bg-slate-50 p-3 ${wide ? "col-span-2 sm:col-span-1" : ""}`}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums text-teal-800">{value}</dd></div>;
}

function CalendarDay({ date, weekday, record, medicalEvents, selected, pdfMode, pdfSelected, generating, today, onSelect }: { date: string; weekday: number; record?: StoredWorkRecord; medicalEvents: MedicalEvent[]; selected: boolean; pdfMode: boolean; pdfSelected: boolean; generating: boolean; today: boolean; onSelect: () => void }) {
  const day = Number(date.slice(-2));
  const status = record?.type;
  const statusLabel = status ? attendanceLabels[status] : "記録なし";
  const weekdayText = !status && weekday === 0 ? "text-rose-600" : !status && weekday === 6 ? "text-blue-600" : "text-slate-700";
  const appearance = status ? attendanceStyles[status] : "border-slate-100 bg-slate-50/60";
  const medicalEventCounts = countMedicalEvents(medicalEvents);
  const medicalSummary = medicalEventCounts.map(({ type, count }) => `${medicalEventLabels[type]}${count > 1 ? `${count}件` : ""}`).join("、");

  return (
    <button
      type="button"
      aria-label={`${formatAccessibleDate(date)}、${statusLabel}${medicalSummary ? `、${medicalSummary}` : ""}${pdfMode ? pdfSelected ? "、出力対象として選択済み" : "、出力対象として未選択" : ""}`}
      aria-pressed={pdfMode ? pdfSelected : selected}
      disabled={generating || (pdfMode && !record)}
      onClick={onSelect}
      className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-xs transition hover:brightness-95 disabled:cursor-not-allowed ${appearance} ${selected ? "ring-2 ring-teal-900 ring-offset-1" : ""} ${pdfSelected ? "ring-4 ring-cyan-300 ring-offset-1" : ""} ${pdfMode && !record ? "opacity-35" : ""} ${today ? "outline-2 outline-offset-1 outline-teal-400" : ""}`}
    >
      {pdfSelected ? <span aria-hidden="true" className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-teal-800 shadow">✓</span> : null}
      {medicalEventCounts.length ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex max-w-[38px] flex-col items-end gap-px">{medicalEventCounts.map(({ type, count }) => <span key={type} className={`whitespace-nowrap rounded-full px-1 text-[8px] font-bold leading-[11px] text-white ring-1 ring-white ${medicalEventStyles[type]}`}>{medicalEventLabels[type]}{count > 1 ? `${count}件` : ""}</span>)}</span> : null}
      <span className={`font-bold tabular-nums ${status ? "text-white" : weekdayText}`}>{day}</span>
      <span className={`mt-0.5 min-h-4 font-bold ${status ? "text-white" : "text-slate-300"}`}>{status ? shortAttendanceLabels[status] : "−"}</span>
    </button>
  );
}

function PdfExportControls({ selectedCount, generating, progress, onSelectAll, onClear, onGeneratePdf, onGenerateImages, onCancel }: { selectedCount: number; generating: "pdf" | "image" | null; progress: { current: number; total: number }; onSelectAll: () => void; onClear: () => void; onGeneratePdf: () => void; onGenerateImages: () => void; onCancel: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-3">
      <p className="text-sm font-bold text-teal-900">{selectedCount}日選択中</p>
      {generating ? <div className="mt-3 flex items-center gap-3" aria-live="polite"><span role="status" aria-label={`${generating === "pdf" ? "PDF" : "画像"}を作成中`} className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700"><span className="sr-only">{generating === "pdf" ? "PDF" : "画像"}を作成中</span></span><p className="text-sm font-semibold text-teal-900">{generating === "pdf" ? "PDF" : "画像"}を作成しています（{progress.current}/{progress.total}）</p></div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onSelectAll} disabled={Boolean(generating)} className="min-h-11 rounded-xl border border-teal-200 bg-white px-2 text-xs font-bold text-teal-800 disabled:opacity-50">この月の記録をすべて選択</button>
        <button type="button" onClick={onClear} disabled={Boolean(generating) || selectedCount === 0} className="min-h-11 rounded-xl border border-teal-200 bg-white px-2 text-xs font-bold text-teal-800 disabled:opacity-50">選択を解除</button>
        <button type="button" onClick={onGeneratePdf} disabled={Boolean(generating) || selectedCount === 0} className="min-h-12 rounded-xl bg-teal-700 px-2 text-sm font-bold text-white disabled:opacity-50">PDFとして保存</button>
        <button type="button" onClick={onGenerateImages} disabled={Boolean(generating) || selectedCount === 0} className="min-h-12 rounded-xl bg-cyan-700 px-2 text-sm font-bold text-white disabled:opacity-50">画像として保存</button>
        <button type="button" onClick={onCancel} disabled={Boolean(generating)} className="col-span-2 min-h-11 rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold text-slate-600 disabled:opacity-50">キャンセル</button>
      </div>
    </div>
  );
}

function isRecordOverflowError(error: unknown): error is { date: string } {
  return error instanceof Error && error.name === "RecordPageOverflowError" && "date" in error;
}

function CalendarLegend() {
  const items: Array<[string, string]> = [
    ["出勤", "bg-teal-600"],
    ["遅刻", "bg-orange-500"],
    ["早退", "bg-indigo-500"],
    ["欠勤", "bg-rose-600"],
    ["休日", "bg-slate-500"],
    ["計画休日", "bg-sky-500"],
    ["未記録", "border border-slate-200 bg-slate-50"],
  ];
  return <ul aria-label="勤務区分の凡例" className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs text-slate-600">{items.map(([label, color]) => <li key={label} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-3 w-3 rounded-sm ${color}`} />{label}</li>)}</ul>;
}

const medicalEventLabels = { visit: "通院", deadline: "予約期限", appointment: "予約" } as const;
const medicalEventStyles = { visit: "bg-cyan-700", deadline: "bg-amber-500", appointment: "bg-violet-600" } as const;

function countMedicalEvents(events: MedicalEvent[]) {
  return (Object.keys(medicalEventLabels) as MedicalEvent["type"][]).flatMap((type) => {
    const count = events.filter((event) => event.type === type).length;
    return count > 0 ? [{ type, count }] : [];
  });
}

function MedicalCalendarLegend() {
  return <ul aria-label="通院予定の凡例" className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs text-slate-600">{(Object.keys(medicalEventLabels) as Array<keyof typeof medicalEventLabels>).map((type) => <li key={type} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${medicalEventStyles[type]}`} />{medicalEventLabels[type]}</li>)}</ul>;
}

function SelectedDaySummary({ date, record, medicalEvents, onEdit, onCreate, onOpenMedical }: { date: string; record: StoredWorkRecord | null; medicalEvents: MedicalEvent[]; onEdit: () => void; onCreate: () => void; onOpenMedical: (recordId: string) => void }) {
  const causes = record ? getCauseDisplayLabels(record.causes) : [];
  return (
    <section className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h2 className="text-base font-bold text-slate-800">{formatDisplayDate(date)}</h2>
      {record ? (
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Detail label="勤務区分" value={attendanceLabels[record.type]} />
            <Detail label="失った時間" value={formatDuration(record.lostMinutes)} />
            <Detail label="本来の勤務時間" value={record.type === "holiday" || record.type === "plannedHoliday" ? "勤務なし" : `${record.scheduledStart}〜${record.scheduledEnd}`} />
            <Detail label="実際の勤務時間" value={record.type === "absent" || record.type === "holiday" || record.type === "plannedHoliday" ? "勤務なし" : `${record.actualStart}〜${record.actualEnd}`} />
          </dl>
          <div><p className="text-xs text-slate-500">主な原因</p><p className="mt-1 text-sm leading-6 text-slate-700">{causes.length > 0 ? causes.slice(0, 4).join("、") : "原因の記録なし"}</p></div>
          <button type="button" onClick={onEdit} className="min-h-12 w-full rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">編集する</button>
        </div>
      ) : (
        <div className="mt-3"><p className="text-sm text-slate-500">この日の記録はありません</p><button type="button" onClick={onCreate} className="mt-4 min-h-12 w-full rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">この日を記録する</button></div>
      )}
      <div className="mt-4 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold text-slate-700">通院・予約</h3>{medicalEvents.length ? <div className="mt-2 space-y-2">{medicalEvents.map((event, index) => <MedicalEventCard key={`${event.type}-${event.record.id}-${index}`} event={event} onOpen={() => onOpenMedical(event.record.id)} />)}</div> : <p className="mt-2 text-sm text-slate-400">通院関係の記録はありません</p>}</div>
    </section>
  );
}

function MedicalEventCard({ event, onOpen }: { event: MedicalEvent; onOpen: () => void }) {
  const { record } = event;
  const showReservationContact = event.type === "deadline" || event.type === "appointment";
  return <article className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold text-teal-800">{medicalEventLabels[event.type]}</p><p className="mt-1 break-words">{record.hospitalName || "病院名未入力"}・{record.department}</p></div><button type="button" onClick={onOpen} className="min-h-11 shrink-0 rounded-lg border border-teal-200 bg-white px-3 font-bold text-teal-800">編集</button></div>
    {event.type === "deadline" ? <dl className="mt-2 space-y-1 text-xs"><div><dt className="inline text-slate-500">予約期限：</dt><dd className="inline">{record.reservationDeadline}</dd></div><div><dt className="inline text-slate-500">予約状況：</dt><dd className="inline">{record.reservationStatus === "booked" ? "予約済み" : "未予約"}</dd></div>{record.reservationNote ? <div><dt className="block text-slate-500">予約期限の備考</dt><dd className="whitespace-pre-wrap">{record.reservationNote}</dd></div> : null}</dl> : null}
    {event.type === "appointment" ? <dl className="mt-2 space-y-1 text-xs"><div><dt className="inline text-slate-500">予約日時：</dt><dd className="inline">{record.appointmentDateTime ? formatMedicalAppointmentDateTime(record.appointmentDateTime) : ""}</dd></div>{record.appointmentBelongings ? <div><dt className="block text-slate-500">持ち物</dt><dd className="whitespace-pre-wrap">{record.appointmentBelongings}</dd></div> : null}{record.appointmentNote ? <div><dt className="block text-slate-500">予約日の備考</dt><dd className="whitespace-pre-wrap">{record.appointmentNote}</dd></div> : null}</dl> : null}
    {showReservationContact && (record.reservationPhone || isSafeExternalUrl(record.hospitalUrl)) ? <div className="mt-3 flex flex-wrap gap-2">{record.reservationPhone ? <a href={`tel:${record.reservationPhone}`} className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 font-bold text-teal-800 underline">{record.reservationPhone}</a> : null}{isSafeExternalUrl(record.hospitalUrl) ? <a href={record.hospitalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-white px-3 font-bold text-teal-800 underline">病院のページ</a> : null}</div> : null}
  </article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-700">{value}</dd></div>;
}

function DataError() {
  return <p role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">記録を読み込めませんでした。通信状態を確認してください</p>;
}

function formatAccessibleDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatDisplayDate(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatMedicalAppointmentDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function isSafeExternalUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

function formatSummaryDuration(minutes: number) {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}時間` : `${hours}時間${remainder}分`;
}
