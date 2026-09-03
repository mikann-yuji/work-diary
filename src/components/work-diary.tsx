"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
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
import {
  getRecordByDate,
  saveOrUpdateRecord,
  subscribeRecords,
  type RecordInput,
  type StoredWorkRecord,
} from "@/lib/firestore/records";
import { calculateLostMinutes, formatDuration } from "@/lib/work-time";
import {
  attendanceLabels,
  attendanceTypes,
  type AttendanceType,
  type MedicationStatus,
  type WorkRecord,
} from "@/types/work-record";

type Tab = "today" | "history";
type HistoryState = "loading" | "empty" | "success" | "error";
type FormState = Omit<WorkRecord, "id" | "lostMinutes">;

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialForm(date = localDate()): FormState {
  return {
    date,
    type: "present",
    scheduledStart: "11:00",
    scheduledEnd: "16:00",
    actualStart: "11:00",
    actualEnd: "16:00",
    causes: createEmptyCauseSelections(),
    medication: createEmptyMedication(),
    previousDay: createEmptyPreviousDayState(),
    waking: createEmptyWakingState(),
  };
}

function formFromRecord(record: WorkRecord): FormState {
  return {
    date: record.date,
    type: record.type,
    scheduledStart: record.scheduledStart,
    scheduledEnd: record.scheduledEnd,
    actualStart: record.actualStart,
    actualEnd: record.actualEnd,
    causes: structuredClone(record.causes),
    medication: structuredClone(record.medication),
    previousDay: { ...record.previousDay },
    waking: { ...record.waking },
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function formatWeekday(date: string) {
  if (!date) return "";
  const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(
    new Date(`${date}T00:00:00`),
  );
  return `（${weekday}）`;
}

export function WorkDiary() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const formStartRef = useRef<HTMLFormElement>(null);
  const loadSequenceRef = useRef(0);
  const savingRef = useRef(false);
  const [tab, setTab] = useState<Tab>("today");
  const [records, setRecords] = useState<StoredWorkRecord[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [baseline, setBaseline] = useState(() => JSON.stringify(createInitialForm()));
  const [recordExists, setRecordExists] = useState(false);
  const [dateLoading, setDateLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lostMinutes = useMemo(
    () => calculateLostMinutes(
      form.type,
      form.scheduledStart,
      form.scheduledEnd,
      form.actualStart,
      form.actualEnd,
    ),
    [form.type, form.scheduledStart, form.scheduledEnd, form.actualStart, form.actualEnd],
  );
  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeRecords(
      uid,
      (nextRecords) => {
        setRecords(nextRecords);
        setHistoryState(nextRecords.length === 0 ? "empty" : "success");
      },
      (error) => {
        console.error("Firestore record subscription failed", error.code);
        setRecords([]);
        setHistoryState("error");
      },
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const sequence = ++loadSequenceRef.current;
    let cancelled = false;

    void getRecordByDate(uid, form.date)
      .then((record) => {
        if (cancelled || sequence !== loadSequenceRef.current) return;
        const nextForm = record ? formFromRecord(record) : createInitialForm(form.date);
        setForm(nextForm);
        setBaseline(JSON.stringify(nextForm));
        setRecordExists(record !== null);
      })
      .catch((error: unknown) => {
        if (cancelled || sequence !== loadSequenceRef.current) return;
        console.error("Firestore record load failed", getErrorCode(error));
        setFormError("この日の記録を読み込めませんでした。通信状況を確認して、もう一度お試しください。");
        setRecordExists(false);
      })
      .finally(() => {
        if (!cancelled && sequence === loadSequenceRef.current) setDateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, form.date]);

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setNotice(null);
  }

  function changeDate(nextDate: string) {
    if (!nextDate || nextDate === form.date) return;
    if (dirty && !window.confirm("入力中の内容があります。日付を変更すると入力内容は失われます。変更しますか？")) return;
    setDateLoading(true);
    setFormError(null);
    updateForm({ date: nextDate });
  }

  function changeAttendanceType(nextType: AttendanceType) {
    updateForm(nextType === "present"
      ? { type: nextType, actualStart: form.scheduledStart, actualEnd: form.scheduledEnd }
      : { type: nextType });
  }

  function changeScheduledStart(value: string) {
    updateForm(form.type === "present"
      ? { scheduledStart: value, actualStart: value }
      : { scheduledStart: value });
  }

  function changeScheduledEnd(value: string) {
    updateForm(form.type === "present"
      ? { scheduledEnd: value, actualEnd: value }
      : { scheduledEnd: value });
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uid || dateLoading || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    setNotice(null);

    const record: RecordInput = {
      date: form.date,
      type: form.type,
      scheduledStart: form.scheduledStart,
      scheduledEnd: form.scheduledEnd,
      actualStart: form.actualStart,
      actualEnd: form.actualEnd,
      lostMinutes,
      causes: structuredClone(form.causes),
      medication: structuredClone(form.medication),
      previousDay: { ...form.previousDay },
      waking: { ...form.waking },
    };

    try {
      const result = await saveOrUpdateRecord(uid, record);
      setRecordExists(true);
      setBaseline(JSON.stringify(form));
      setNotice(result.created ? "記録を保存しました" : "記録を更新しました");
      setTab("history");
    } catch (error) {
      console.error("Firestore record save failed", getErrorCode(error));
      setFormError("記録を保存できませんでした。入力内容はそのままです。通信状況を確認して、もう一度お試しください。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function editRecord(record: StoredWorkRecord) {
    if (dirty && !window.confirm("入力中の内容があります。履歴の記録を開くと入力内容は失われます。開きますか？")) return;
    loadSequenceRef.current += 1;
    const nextForm = formFromRecord(record);
    setForm(nextForm);
    setBaseline(JSON.stringify(nextForm));
    setRecordExists(true);
    setDateLoading(false);
    setFormError(null);
    setNotice(null);
    setTab("today");
    requestAnimationFrame(() => formStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_18px_50px_rgba(43,89,85,0.10)] backdrop-blur">
      <div className="grid grid-cols-2 gap-1 border-b border-slate-100 bg-slate-50/70 p-2" role="tablist" aria-label="記録画面">
        {([["today", "今日の記録"], ["history", "履歴"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-12 rounded-2xl px-3 text-base font-bold transition ${tab === value ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
            {value === "history" && records.length > 0 ? <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-800">{records.length}</span> : null}
          </button>
        ))}
      </div>

      {notice ? <p role="status" className="m-4 mb-0 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900">{notice}</p> : null}

      {tab === "today" ? (
        <form ref={formStartRef} onSubmit={saveRecord} aria-busy={dateLoading || saving} className="space-y-5 bg-slate-50/50 p-4 sm:p-5">
          {formError ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{formError}</p> : null}
          {dateLoading ? <p role="status" className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-500">この日の記録を読み込んでいます…</p> : null}
          <fieldset disabled={dateLoading || saving} className="contents">
            <SectionCard title="勤務状況" description="わかる範囲から入力してください。">
              <div className="space-y-6">
                <Field label="日付">
                  <div className="input flex items-center gap-2 focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-100">
                    <input required type="date" value={form.date} onChange={(event) => changeDate(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
                    <span className="shrink-0 text-sm font-bold text-teal-800" aria-live="polite">{formatWeekday(form.date)}</span>
                  </div>
                </Field>

                <fieldset>
                  <legend className="label">区分</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {attendanceTypes.map((value) => (
                      <button key={value} type="button" aria-pressed={form.type === value} onClick={() => changeAttendanceType(value)} className={`min-h-12 rounded-xl border text-base font-bold transition ${form.type === value ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}>
                        {attendanceLabels[value]}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <TimePair legend="本来の勤務時間" start={form.scheduledStart} end={form.scheduledEnd} onStart={changeScheduledStart} onEnd={changeScheduledEnd} requiredStart requiredEnd />
                <TimePair legend="実際の勤務時間" start={form.actualStart} end={form.actualEnd} onStart={(actualStart) => updateForm({ actualStart })} onEnd={(actualEnd) => updateForm({ actualEnd })} disabled={form.type === "absent"} requiredStart={form.type === "present" || form.type === "late"} requiredEnd={form.type === "present" || form.type === "early"} />

                <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-4" aria-live="polite">
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="text-sm font-bold text-teal-800">失った時間</p><p className="mt-1 text-xs leading-5 text-teal-700/70">入力内容から自動で計算されます</p></div>
                    <output className="shrink-0 text-xl font-bold tabular-nums text-teal-800">{formatDuration(lostMinutes)}</output>
                  </div>
                </div>
              </div>
            </SectionCard>

            <CauseSelector value={form.causes} onChange={(causes) => updateForm({ causes })} />
            <MedicationSection value={form.medication} onChange={(medication) => updateForm({ medication })} />
            <PreviousDaySection value={form.previousDay} onChange={(previousDay) => updateForm({ previousDay })} />
            <WakingSection value={form.waking} onChange={(waking) => updateForm({ waking })} />
          </fieldset>

          <button type="submit" disabled={!uid || dateLoading || saving} className="min-h-14 w-full rounded-2xl bg-teal-700 px-5 text-base font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 active:scale-[0.99] disabled:cursor-wait disabled:opacity-55">
            {saving ? "保存しています…" : recordExists ? "この日の記録を更新" : "この日の記録を保存"}
          </button>
          <p className="text-center text-xs leading-5 text-slate-400">記録はログイン中のアカウントごとに保存されます。</p>
        </form>
      ) : (
        <History records={records} state={historyState} onEdit={editRecord} />
      )}
    </section>
  );
}

function History({ records, state, onEdit }: { records: StoredWorkRecord[]; state: HistoryState; onEdit: (record: StoredWorkRecord) => void }) {
  return (
    <div className="min-h-[420px] p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-800">これまでの記録</h2>
      {state === "loading" ? <HistoryMessage title="記録を読み込んでいます…" /> : null}
      {state === "error" ? <HistoryMessage title="履歴を取得できませんでした" description="通信状況を確認して、しばらくしてからもう一度お試しください。" error /> : null}
      {state === "empty" ? <HistoryMessage title="記録はまだありません" description="「今日の記録」から保存すると、ここで振り返れます。" /> : null}
      {state === "success" ? <div className="mt-4 space-y-3">{records.map((record) => <HistoryCard key={record.id} record={record} onEdit={() => onEdit(record)} />)}</div> : null}
    </div>
  );
}

function HistoryMessage({ title, description, error = false }: { title: string; description?: string; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className="flex min-h-72 flex-col items-center justify-center text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-2xl">{error ? "…" : "🌿"}</div><p className="font-bold text-slate-700">{title}</p>{description ? <p className="mt-2 max-w-64 text-sm leading-6 text-slate-500">{description}</p> : null}</div>;
}

function HistoryCard({ record, onEdit }: { record: StoredWorkRecord; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const causeLabels = getCauseDisplayLabels(record.causes);
  const detailsId = `record-details-${record.id}`;

  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3"><time className="text-sm font-bold text-slate-700">{formatDate(record.date)}</time><span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800">{attendanceLabels[record.type]}</span></div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-3 text-sm"><span className="text-slate-500">失った時間</span><strong className="text-base text-teal-800">{formatDuration(record.lostMinutes)}</strong></div>
      <div className="mt-4"><p className="mb-2 text-xs font-bold text-slate-500">原因</p>{causeLabels.length > 0 ? <div className="flex flex-wrap gap-1.5">{causeLabels.map((label) => <span key={label} className="rounded-full border border-teal-100 bg-white px-2.5 py-1 text-xs leading-5 text-slate-600">{label}</span>)}</div> : <p className="text-sm text-slate-400">原因の記録なし</p>}</div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-white p-3 text-sm">
        <HistoryValue label="前日の睡眠時間" value={record.previousDay.sleepHours === null ? "未入力" : `${record.previousDay.sleepHours}時間`} />
        <HistoryValue label="中途覚醒" value={record.previousDay.awakenings === null ? "未入力" : `${record.previousDay.awakenings}回`} />
        <HistoryValue label="眠りの深さ" value={record.previousDay.sleepDepth === null ? "未入力" : sleepDepthLabels[record.previousDay.sleepDepth]} />
        <HistoryValue label="帰宅後の疲労" value={formatRating(record.previousDay.fatigueAfterReturningHome)} />
        <HistoryValue label="起床時の眠気" value={formatRating(record.waking.sleepiness)} />
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onEdit} className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white transition hover:bg-teal-800">編集</button>
        <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((current) => !current)} className="min-h-11 rounded-xl border border-teal-200 bg-white px-3 text-sm font-bold text-teal-800 transition hover:bg-teal-50">{expanded ? "詳細を閉じる" : "詳細を見る"}</button>
      </div>
      {expanded ? <div id={detailsId} className="mt-4 space-y-4 border-t border-slate-200 pt-4"><div><h3 className="text-sm font-bold text-slate-700">服薬</h3><dl className="mt-2 space-y-2">{medicationPeriods.map((period) => { const entry = record.medication[period.id]; return <div key={period.id} className="grid grid-cols-[2rem_4rem_1fr] gap-2 text-sm"><dt className="font-semibold text-slate-600">{period.label}</dt><dd className="text-slate-500">{formatMedicationStatus(entry.status)}</dd><dd className="break-words text-slate-500">{entry.note || "メモなし"}</dd></div>; })}</dl></div><div><h3 className="text-sm font-bold text-slate-700">起床時の体調</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{record.waking.conditionNote || "未入力"}</p></div></div> : null}
    </article>
  );
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
}

function HistoryValue({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-0.5 font-semibold text-slate-700">{value}</dd></div>; }
function formatRating(value: number | null) { return value === null ? "未入力" : `${value} / 5`; }
function formatMedicationStatus(status: MedicationStatus) { if (status === "taken") return "有"; if (status === "not_taken") return "無"; return "未入力"; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="label">{label}</span>{children}</label>; }

type TimePairProps = { legend: string; start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void; disabled?: boolean; requiredStart?: boolean; requiredEnd?: boolean; };

function TimePair({ legend, start, end, onStart, onEnd, disabled = false, requiredStart = false, requiredEnd = false }: TimePairProps) {
  return <fieldset disabled={disabled} className={disabled ? "opacity-45" : ""}><legend className="label">{legend}{disabled ? <span className="ml-2 font-normal text-slate-400">（欠席のため入力不要）</span> : null}</legend><div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden"><input aria-label={`${legend}の開始`} required={requiredStart} type="time" value={start} onChange={(event) => onStart(event.target.value)} className="input min-w-0 max-w-full px-1 text-center sm:px-3" /><span className="text-slate-400">〜</span><input aria-label={`${legend}の終了`} required={requiredEnd} type="time" value={end} onChange={(event) => onEnd(event.target.value)} className="input min-w-0 max-w-full px-1 text-center sm:px-3" /></div></fieldset>;
}
