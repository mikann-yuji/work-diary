"use client";

import { FormEvent, useMemo, useState } from "react";
import { CauseSelector } from "@/components/cause-selector";
import {
  MedicationSection,
  PreviousDaySection,
  SectionCard,
  WakingSection,
} from "@/components/wellness-sections";
import {
  createEmptyCauseSelections,
  getCauseDisplayLabels,
} from "@/constants/cause-options";
import {
  createEmptyMedication,
  createEmptyPreviousDayState,
  createEmptyWakingState,
  medicationPeriods,
  sleepDepthLabels,
} from "@/constants/wellness-options";
import { calculateLostMinutes, formatDuration } from "@/lib/work-time";
import {
  attendanceLabels,
  attendanceTypes,
  type AttendanceType,
  type MedicationStatus,
  type WorkRecord,
} from "@/types/work-record";

type Tab = "today" | "history";

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
}

export function WorkDiary() {
  const [tab, setTab] = useState<Tab>("today");
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [date, setDate] = useState(localDate);
  const [type, setType] = useState<AttendanceType>("present");
  const [scheduledStart, setScheduledStart] = useState("11:00");
  const [scheduledEnd, setScheduledEnd] = useState("16:00");
  const [actualStart, setActualStart] = useState("11:00");
  const [actualEnd, setActualEnd] = useState("16:00");
  const [causes, setCauses] = useState(createEmptyCauseSelections);
  const [medication, setMedication] = useState(createEmptyMedication);
  const [previousDay, setPreviousDay] = useState(createEmptyPreviousDayState);
  const [waking, setWaking] = useState(createEmptyWakingState);

  const lostMinutes = useMemo(
    () => calculateLostMinutes(type, scheduledStart, scheduledEnd, actualStart, actualEnd),
    [type, scheduledStart, scheduledEnd, actualStart, actualEnd],
  );

  function changeAttendanceType(nextType: AttendanceType) {
    setType(nextType);
    if (nextType === "present") {
      setActualStart(scheduledStart);
      setActualEnd(scheduledEnd);
    }
  }

  function changeScheduledStart(value: string) {
    setScheduledStart(value);
    if (type === "present") setActualStart(value);
  }

  function changeScheduledEnd(value: string) {
    setScheduledEnd(value);
    if (type === "present") setActualEnd(value);
  }

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const record: WorkRecord = {
      id: crypto.randomUUID(),
      date,
      type,
      scheduledStart,
      scheduledEnd,
      actualStart,
      actualEnd,
      lostMinutes,
      causes: structuredClone(causes),
      medication: structuredClone(medication),
      previousDay: { ...previousDay },
      waking: { ...waking },
    };
    setRecords((current) => [record, ...current]);
    setDate(localDate());
    setType("present");
    setScheduledStart("11:00");
    setScheduledEnd("16:00");
    setActualStart("11:00");
    setActualEnd("16:00");
    setCauses(createEmptyCauseSelections());
    setMedication(createEmptyMedication());
    setPreviousDay(createEmptyPreviousDayState());
    setWaking(createEmptyWakingState());
    setTab("history");
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_18px_50px_rgba(43,89,85,0.10)] backdrop-blur">
      <div className="grid grid-cols-2 gap-1 border-b border-slate-100 bg-slate-50/70 p-2" role="tablist" aria-label="記録画面">
        {([ ["today", "今日の記録"], ["history", "履歴"] ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-2xl px-3 text-base font-bold transition ${tab === value ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {label}
            {value === "history" && records.length > 0 ? (
              <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-800">{records.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "today" ? (
        <form onSubmit={saveRecord} className="space-y-5 bg-slate-50/50 p-4 sm:p-5">
          <SectionCard title="勤務状況" description="わかる範囲から入力してください。">
            <div className="space-y-6">

          <Field label="日付">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" />
              <span className="text-sm font-semibold text-teal-800">{formatDate(date)}</span>
            </div>
          </Field>

          <fieldset>
            <legend className="label">区分</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {attendanceTypes.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => changeAttendanceType(value)}
                  className={`min-h-12 rounded-xl border text-base font-bold transition ${
                    type === value
                      ? "border-teal-700 bg-teal-700 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                  }`}
                >
                  {attendanceLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <TimePair
            legend="本来の勤務時間"
            start={scheduledStart}
            end={scheduledEnd}
            onStart={changeScheduledStart}
            onEnd={changeScheduledEnd}
            requiredStart
            requiredEnd
          />

          <TimePair
            legend="実際の勤務時間"
            start={actualStart}
            end={actualEnd}
            onStart={setActualStart}
            onEnd={setActualEnd}
            disabled={type === "absent"}
            requiredStart={type === "present" || type === "late"}
            requiredEnd={type === "present" || type === "early"}
          />

          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-4" aria-live="polite">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-teal-800">失った時間</p>
                <p className="mt-1 text-xs leading-5 text-teal-700/70">入力内容から自動で計算されます</p>
              </div>
              <output className="shrink-0 text-xl font-bold tabular-nums text-teal-800">{formatDuration(lostMinutes)}</output>
            </div>
          </div>
            </div>
          </SectionCard>

          <CauseSelector value={causes} onChange={setCauses} />

          <MedicationSection value={medication} onChange={setMedication} />

          <PreviousDaySection value={previousDay} onChange={setPreviousDay} />

          <WakingSection value={waking} onChange={setWaking} />

          <button type="submit" className="min-h-14 w-full rounded-2xl bg-teal-700 px-5 text-base font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 active:scale-[0.99]">
            この内容を保存
          </button>
          <p className="text-center text-xs leading-5 text-slate-400">この段階では、記録はブラウザを閉じると消去されます。</p>
        </form>
      ) : (
        <History records={records} />
      )}
    </section>
  );
}

function History({ records }: { records: WorkRecord[] }) {
  return (
    <div className="min-h-[420px] p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-800">これまでの記録</h2>
      {records.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-2xl">🌿</div>
          <p className="font-bold text-slate-700">記録はまだありません</p>
          <p className="mt-2 max-w-64 text-sm leading-6 text-slate-500">「今日の記録」から保存すると、ここで振り返れます。</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {records.map((record) => {
            return <HistoryCard key={record.id} record={record} />;
          })}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ record }: { record: WorkRecord }) {
  const [expanded, setExpanded] = useState(false);
  const causeLabels = getCauseDisplayLabels(record.causes);
  const detailsId = `record-details-${record.id}`;

  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <time className="text-sm font-bold text-slate-700">{formatDate(record.date)}</time>
        <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800">{attendanceLabels[record.type]}</span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-3 text-sm">
        <span className="text-slate-500">失った時間</span>
        <strong className="text-base text-teal-800">{formatDuration(record.lostMinutes)}</strong>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-bold text-slate-500">原因</p>
        {causeLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {causeLabels.map((label) => (
              <span key={label} className="rounded-full border border-teal-100 bg-white px-2.5 py-1 text-xs leading-5 text-slate-600">{label}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">原因の記録なし</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-white p-3 text-sm">
        <HistoryValue label="前日の睡眠時間" value={record.previousDay.sleepHours === null ? "未入力" : `${record.previousDay.sleepHours}時間`} />
        <HistoryValue label="中途覚醒" value={record.previousDay.awakenings === null ? "未入力" : `${record.previousDay.awakenings}回`} />
        <HistoryValue label="眠りの深さ" value={record.previousDay.sleepDepth === null ? "未入力" : sleepDepthLabels[record.previousDay.sleepDepth]} />
        <HistoryValue label="帰宅後の疲労" value={formatRating(record.previousDay.fatigueAfterReturningHome)} />
        <HistoryValue label="起床時の眠気" value={formatRating(record.waking.sleepiness)} />
      </dl>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
        className="mt-4 min-h-11 w-full rounded-xl border border-teal-200 bg-white px-4 text-sm font-bold text-teal-800 transition hover:bg-teal-50"
      >
        {expanded ? "詳細を閉じる" : "服薬・体調の詳細を見る"}
      </button>

      {expanded ? (
        <div id={detailsId} className="mt-4 space-y-4 border-t border-slate-200 pt-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700">服薬</h3>
            <dl className="mt-2 space-y-2">
              {medicationPeriods.map((period) => {
                const entry = record.medication[period.id];
                return (
                  <div key={period.id} className="grid grid-cols-[2rem_4rem_1fr] gap-2 text-sm">
                    <dt className="font-semibold text-slate-600">{period.label}</dt>
                    <dd className="text-slate-500">{formatMedicationStatus(entry.status)}</dd>
                    <dd className="break-words text-slate-500">{entry.note || "メモなし"}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700">起床時の体調</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{record.waking.conditionNote || "未入力"}</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function HistoryValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-0.5 font-semibold text-slate-700">{value}</dd></div>;
}

function formatRating(value: number | null) {
  return value === null ? "未入力" : `${value} / 5`;
}

function formatMedicationStatus(status: MedicationStatus) {
  if (status === "taken") return "有";
  if (status === "not_taken") return "無";
  return "未入力";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

type TimePairProps = {
  legend: string;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  disabled?: boolean;
  requiredStart?: boolean;
  requiredEnd?: boolean;
};

function TimePair({ legend, start, end, onStart, onEnd, disabled = false, requiredStart = false, requiredEnd = false }: TimePairProps) {
  return (
    <fieldset disabled={disabled} className={disabled ? "opacity-45" : ""}>
      <legend className="label">
        {legend}
        {disabled ? <span className="ml-2 font-normal text-slate-400">（欠席のため入力不要）</span> : null}
      </legend>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input aria-label={`${legend}の開始`} required={requiredStart} type="time" value={start} onChange={(event) => onStart(event.target.value)} className="input text-center" />
        <span className="text-slate-400">〜</span>
        <input aria-label={`${legend}の終了`} required={requiredEnd} type="time" value={end} onChange={(event) => onEnd(event.target.value)} className="input text-center" />
      </div>
    </fieldset>
  );
}
