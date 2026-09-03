"use client";

import { useMemo, useState } from "react";
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
import { LoadingSpinner } from "@/components/loading-spinner";

type RecordsState = "loading" | "empty" | "success" | "error";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const shortAttendanceLabels: Record<AttendanceType, string> = {
  present: "出",
  late: "遅",
  early: "早",
  absent: "欠",
};
const attendanceStyles: Record<AttendanceType, string> = {
  present: "border-teal-600 bg-teal-600 text-white",
  late: "border-orange-500 bg-orange-500 text-white",
  early: "border-indigo-500 bg-indigo-500 text-white",
  absent: "border-rose-600 bg-rose-600 text-white",
};

export function MonthlyCalendar({
  recordsByDate,
  recordsState,
  onEdit,
  onCreate,
}: {
  recordsByDate: ReadonlyMap<string, StoredWorkRecord>;
  recordsState: RecordsState;
  onEdit: (record: StoredWorkRecord) => void;
  onCreate: (date: string) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(getCurrentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(getLocalDateString);
  const today = useMemo(() => getLocalDateString(), []);
  const calendarDays = useMemo(() => createCalendarDays(visibleMonth), [visibleMonth]);
  const summary = useMemo(
    () => summarizeMonth(recordsByDate.values(), visibleMonth),
    [recordsByDate, visibleMonth],
  );
  const selectedRecord = selectedDate ? recordsByDate.get(selectedDate) ?? null : null;
  const selectedDateInMonth = selectedDate?.startsWith(
    `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, "0")}-`,
  ) ?? false;

  function moveMonth(amount: number) {
    setVisibleMonth((current) => shiftMonth(current, amount));
    setSelectedDate(null);
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
            <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
              <button type="button" aria-label="前の月を表示" onClick={() => moveMonth(-1)} className="min-h-11 rounded-xl border border-slate-200 text-xl font-bold text-teal-800 hover:bg-teal-50">‹</button>
              <h2 className="text-center text-lg font-bold text-slate-800">{visibleMonth.year}年{visibleMonth.month}月</h2>
              <button type="button" aria-label="次の月を表示" onClick={() => moveMonth(1)} className="min-h-11 rounded-xl border border-slate-200 text-xl font-bold text-teal-800 hover:bg-teal-50">›</button>
            </div>

            <CalendarLegend />

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
                  selected={selectedDate === date}
                  today={date === today}
                  onSelect={() => setSelectedDate(date)}
                />
              ) : <div key={`empty-${index}`} aria-hidden="true" className="min-h-14" />)}
            </div>
          </section>

          {selectedDate && selectedDateInMonth ? (
            <SelectedDaySummary
              date={selectedDate}
              record={selectedRecord}
              onEdit={() => selectedRecord && onEdit(selectedRecord)}
              onCreate={() => onCreate(selectedDate)}
            />
          ) : null}
        </div>
      )}
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

function CalendarDay({ date, weekday, record, selected, today, onSelect }: { date: string; weekday: number; record?: StoredWorkRecord; selected: boolean; today: boolean; onSelect: () => void }) {
  const day = Number(date.slice(-2));
  const status = record?.type;
  const statusLabel = status ? attendanceLabels[status] : "記録なし";
  const weekdayText = !status && weekday === 0 ? "text-rose-600" : !status && weekday === 6 ? "text-blue-600" : "text-slate-700";
  const appearance = status ? attendanceStyles[status] : "border-slate-100 bg-slate-50/60";

  return (
    <button
      type="button"
      aria-label={`${formatAccessibleDate(date)}、${statusLabel}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-xs transition hover:brightness-95 ${appearance} ${selected ? "ring-2 ring-teal-900 ring-offset-1" : ""} ${today ? "outline-2 outline-offset-1 outline-teal-400" : ""}`}
    >
      <span className={`font-bold tabular-nums ${status ? "text-white" : weekdayText}`}>{day}</span>
      <span className={`mt-0.5 min-h-4 font-bold ${status ? "text-white" : "text-slate-300"}`}>{status ? shortAttendanceLabels[status] : "−"}</span>
    </button>
  );
}

function CalendarLegend() {
  const items: Array<[string, string]> = [
    ["出勤", "bg-teal-600"],
    ["遅刻", "bg-orange-500"],
    ["早退", "bg-indigo-500"],
    ["欠勤", "bg-rose-600"],
    ["未記録", "border border-slate-200 bg-slate-50"],
  ];
  return <ul aria-label="勤務区分の凡例" className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs text-slate-600">{items.map(([label, color]) => <li key={label} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-3 w-3 rounded-sm ${color}`} />{label}</li>)}</ul>;
}

function SelectedDaySummary({ date, record, onEdit, onCreate }: { date: string; record: StoredWorkRecord | null; onEdit: () => void; onCreate: () => void }) {
  const causes = record ? getCauseDisplayLabels(record.causes) : [];
  return (
    <section className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
      <h2 className="text-base font-bold text-slate-800">{formatDisplayDate(date)}</h2>
      {record ? (
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Detail label="勤務区分" value={attendanceLabels[record.type]} />
            <Detail label="失った時間" value={formatDuration(record.lostMinutes)} />
            <Detail label="本来の勤務時間" value={`${record.scheduledStart}〜${record.scheduledEnd}`} />
            <Detail label="実際の勤務時間" value={record.type === "absent" ? "勤務なし" : `${record.actualStart}〜${record.actualEnd}`} />
          </dl>
          <div><p className="text-xs text-slate-500">主な原因</p><p className="mt-1 text-sm leading-6 text-slate-700">{causes.length > 0 ? causes.slice(0, 4).join("、") : "原因の記録なし"}</p></div>
          <button type="button" onClick={onEdit} className="min-h-12 w-full rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">編集する</button>
        </div>
      ) : (
        <div className="mt-3"><p className="text-sm text-slate-500">この日の記録はありません</p><button type="button" onClick={onCreate} className="mt-4 min-h-12 w-full rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">この日を記録する</button></div>
      )}
    </section>
  );
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

function formatSummaryDuration(minutes: number) {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}時間` : `${hours}時間${remainder}分`;
}
