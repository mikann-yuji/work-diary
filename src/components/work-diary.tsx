"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CauseSelector } from "@/components/cause-selector";
import { LoadingSpinner } from "@/components/loading-spinner";
import { MonthlyCalendar } from "@/components/monthly-calendar";
import { MedicalRecordsPage } from "@/components/medical-records-page";
import {
  CountermeasureSection,
  FutureMeasuresSection,
  MemoSection,
  TodayMeasuresSection,
} from "@/components/measure-sections";
import { Toast, type ToastMessage } from "@/components/toast";
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
import { getLocalDateString } from "@/lib/calendar";
import { subscribeMedicalRecords } from "@/lib/firestore/medical-records";
import type { StoredMedicalRecord } from "@/types/medical-record";
import {
  createEmptyFutureMeasures,
  createEmptyTodayMeasures,
  futureMeasureExecutionLabels,
} from "@/constants/measure-options";
import { calculateLostMinutes, formatDuration } from "@/lib/work-time";
import { deleteDraft, getDraft, type DraftEntry } from "@/lib/drafts/indexed-db";
import { useDraftAutosave, type DraftSaveState } from "@/hooks/use-draft-autosave";
import {
  attendanceLabels,
  attendanceTypes,
  type AttendanceType,
  type MedicationStatus,
  type WorkRecord,
} from "@/types/work-record";

export type DiaryTab = "today" | "medical" | "calendar" | "history";
type HistoryState = "loading" | "empty" | "success" | "error";
type FormState = Omit<WorkRecord, "id" | "lostMinutes">;

function createInitialForm(date = getLocalDateString()): FormState {
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
    countermeasure: "",
    todayMeasures: createEmptyTodayMeasures(),
    futureMeasures: createEmptyFutureMeasures(),
    memo: "",
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
    countermeasure: record.countermeasure,
    todayMeasures: structuredClone(record.todayMeasures),
    futureMeasures: structuredClone(record.futureMeasures),
    memo: record.memo,
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

export function WorkDiary({ tab, onTabChange, onDraftStatusChange }: { tab: DiaryTab; onTabChange: (tab: DiaryTab) => void; onDraftStatusChange: (status: { state: DraftSaveState; savedAt: number | null } | null) => void }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const formStartRef = useRef<HTMLFormElement>(null);
  const loadSequenceRef = useRef(0);
  const savingRef = useRef(false);
  const toastIdRef = useRef(0);
  const lastDraftErrorToastRef = useRef(0);
  const [records, setRecords] = useState<StoredWorkRecord[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<StoredMedicalRecord[]>([]);
  const [medicalState, setMedicalState] = useState<HistoryState>("loading");
  const [requestedMedicalId, setRequestedMedicalId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [baseline, setBaseline] = useState(() => JSON.stringify(createInitialForm()));
  const [recordExists, setRecordExists] = useState(false);
  const [dateLoading, setDateLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [medicalDraftStatus, setMedicalDraftStatus] = useState<{ state: DraftSaveState; savedAt: number | null } | null>(null);
  const workDraftKey = uid ? `work-record:${uid}:${form.date}` : "work-record:unavailable";
  const workDraft = useMemo<DraftEntry<FormState>>(() => ({ key: workDraftKey, uid: uid ?? "", kind: "work-record", mode: "date", targetId: form.date, payload: form, updatedAt: 0 }), [workDraftKey, uid, form]);
  const draftAutosave = useDraftAutosave({ draft: workDraft, enabled: Boolean(uid) && !dateLoading && !saving });

  useEffect(() => {
    const status = tab === "today"
      ? draftAutosave.state === "clean" ? null : { state: draftAutosave.state, savedAt: draftAutosave.savedAt }
      : tab === "medical" ? medicalDraftStatus : null;
    onDraftStatusChange(status);
    if (status?.state === "error" && Date.now() - lastDraftErrorToastRef.current > 30000) {
      lastDraftErrorToastRef.current = Date.now();
      showToast("下書きを保存できませんでした", "error");
    }
  }, [tab, draftAutosave.state, draftAutosave.savedAt, medicalDraftStatus, onDraftStatusChange]);
  useEffect(() => () => onDraftStatusChange(null), [onDraftStatusChange]);

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
  const recordsByDate = useMemo(
    () => new Map(records.map((record) => [record.date, record])),
    [records],
  );
  const closeToast = useCallback(() => setToast(null), []);

  function showToast(message: string, type: ToastMessage["type"]) {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, type });
  }

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
        setHistoryState("error");
      },
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeMedicalRecords(uid, (nextRecords) => {
      setMedicalRecords(nextRecords);
      setMedicalState(nextRecords.length ? "success" : "empty");
    }, () => setMedicalState("error"));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const sequence = ++loadSequenceRef.current;
    let cancelled = false;

    void getRecordByDate(uid, form.date)
      .then(async (record) => {
        if (cancelled || sequence !== loadSequenceRef.current) return;
        const firestoreForm = record ? formFromRecord(record) : createInitialForm(form.date);
        const firestoreSignature = JSON.stringify(firestoreForm);
        const draftKey = `work-record:${uid}:${form.date}`;
        const draft = await getDraft<FormState>(draftKey);
        if (cancelled || sequence !== loadSequenceRef.current) return;
        let nextForm = firestoreForm;
        if (draft?.payload?.date === form.date && JSON.stringify(draft.payload) !== firestoreSignature) {
          const firestoreUpdatedAt = record?.updatedAt?.toMillis() ?? null;
          const restoreDraft = !record || (firestoreUpdatedAt !== null
            ? draft.updatedAt > firestoreUpdatedAt
            : window.confirm("保存されている下書きを復元しますか？\nキャンセルすると正式保存済みの記録を表示します。"));
          if (restoreDraft) {
            nextForm = draft.payload;
            showToast("保存されていた下書きを復元しました", "success");
          } else {
            await deleteDraft(draftKey);
          }
        } else if (draft) {
          await deleteDraft(draftKey);
        }
        setForm(nextForm);
        setBaseline(firestoreSignature);
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
      : nextType === "absent" || nextType === "holiday" || nextType === "plannedHoliday"
        ? { type: nextType, actualStart: "", actualEnd: "" }
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
      countermeasure: form.countermeasure,
      todayMeasures: structuredClone(form.todayMeasures),
      futureMeasures: structuredClone(form.futureMeasures),
      memo: form.memo,
    };

    try {
      const result = await saveOrUpdateRecord(uid, record);
      await deleteDraft(workDraftKey).catch(() => undefined);
      setRecordExists(true);
      setBaseline(JSON.stringify(form));
      draftAutosave.markClean(JSON.stringify(form));
      showToast(result.created ? "記録を保存しました" : "記録を更新しました", "success");
    } catch (error) {
      console.error("Firestore record save failed", getErrorCode(error));
      showToast("記録を保存できませんでした。通信状態を確認してください", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function discardWorkDraft() {
    if (!uid || !window.confirm("この下書きを削除しますか？\n入力した内容は元に戻せません。")) return;
    await deleteDraft(workDraftKey);
    const record = await getRecordByDate(uid, form.date);
    const nextForm = record ? formFromRecord(record) : createInitialForm(form.date);
    setForm(nextForm);
    setBaseline(JSON.stringify(nextForm));
    setRecordExists(Boolean(record));
    draftAutosave.markClean(JSON.stringify(nextForm));
  }

  async function editRecord(record: StoredWorkRecord) {
    if (dirty && !window.confirm("入力中の内容があります。履歴の記録を開くと入力内容は失われます。開きますか？")) return;
    loadSequenceRef.current += 1;
    const firestoreForm = formFromRecord(record);
    if (record.date !== form.date) {
      setForm(firestoreForm);
      setBaseline(JSON.stringify(firestoreForm));
      setRecordExists(true);
      setDateLoading(true);
      setFormError(null);
      onTabChange("today");
      scrollToForm(formStartRef);
      return;
    }
    const draftKey = uid ? `work-record:${uid}:${record.date}` : null;
    const draft = draftKey ? await getDraft<FormState>(draftKey) : undefined;
    const firestoreUpdatedAt = record.updatedAt?.toMillis() ?? null;
    const restoreDraft = draft && JSON.stringify(draft.payload) !== JSON.stringify(firestoreForm) && (firestoreUpdatedAt !== null
      ? draft.updatedAt > firestoreUpdatedAt
      : window.confirm("保存されている下書きを復元しますか？\nキャンセルすると正式保存済みの記録を表示します。"));
    const nextForm = restoreDraft ? draft.payload : firestoreForm;
    if (draftKey && draft && !restoreDraft) await deleteDraft(draftKey);
    setForm(nextForm);
    setBaseline(JSON.stringify(firestoreForm));
    setRecordExists(true);
    setDateLoading(false);
    setFormError(null);
    if (restoreDraft) showToast("保存されていた下書きを復元しました", "success");
    onTabChange("today");
    scrollToForm(formStartRef);
  }

  function createRecordForDate(date: string) {
    if (dirty && !window.confirm("入力中の内容があります。別の日の記録を始めると入力内容は失われます。続けますか？")) return;
    loadSequenceRef.current += 1;
    const dateChanged = form.date !== date;
    const nextForm = createInitialForm(date);
    setForm(nextForm);
    setBaseline(JSON.stringify(nextForm));
    setRecordExists(false);
    setDateLoading(dateChanged);
    setFormError(null);
    onTabChange("today");
    scrollToForm(formStartRef);
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_18px_50px_rgba(43,89,85,0.10)] backdrop-blur">
      {tab === "today" ? (
        <form ref={formStartRef} onSubmit={saveRecord} aria-busy={dateLoading || saving} className="relative space-y-5 bg-slate-50/50 p-4 sm:p-5">
          {formError ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{formError}</p> : null}
          {dateLoading ? <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/75 pt-32 backdrop-blur-[1px]"><LoadingSpinner /></div> : null}
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {attendanceTypes.map((value) => (
                      <button key={value} type="button" aria-pressed={form.type === value} onClick={() => changeAttendanceType(value)} className={`min-h-12 rounded-xl border text-base font-bold transition ${form.type === value ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}>
                        {attendanceLabels[value]}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <TimePair legend="本来の勤務時間" start={form.scheduledStart} end={form.scheduledEnd} onStart={changeScheduledStart} onEnd={changeScheduledEnd} disabled={form.type === "holiday" || form.type === "plannedHoliday"} requiredStart requiredEnd />
                <TimePair legend="実際の勤務時間" start={form.actualStart} end={form.actualEnd} onStart={(actualStart) => updateForm({ actualStart })} onEnd={(actualEnd) => updateForm({ actualEnd })} disabled={form.type === "absent" || form.type === "holiday" || form.type === "plannedHoliday"} requiredStart={form.type === "present" || form.type === "late"} requiredEnd={form.type === "present" || form.type === "early"} />

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
            <CountermeasureSection value={form.countermeasure} onChange={(countermeasure) => updateForm({ countermeasure })} />
            <TodayMeasuresSection value={form.todayMeasures} onChange={(todayMeasures) => updateForm({ todayMeasures })} />
            <FutureMeasuresSection value={form.futureMeasures} onChange={(futureMeasures) => updateForm({ futureMeasures })} />
            <MemoSection value={form.memo} onChange={(memo) => updateForm({ memo })} />
          </fieldset>

          <button type="submit" disabled={!uid || dateLoading || saving} className="min-h-14 w-full rounded-2xl bg-teal-700 px-5 text-base font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 active:scale-[0.99] disabled:cursor-wait disabled:opacity-55">
            {saving ? "保存しています…" : recordExists ? "この日の記録を更新" : "この日の記録を保存"}
          </button>
          {draftAutosave.state !== "clean" ? <button type="button" onClick={() => void discardWorkDraft()} disabled={dateLoading || saving} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 disabled:opacity-50">下書きを破棄</button> : null}
          <p className="text-center text-xs leading-5 text-slate-400">記録はログイン中のアカウントごとに保存されます。</p>
          <p className="text-center text-xs leading-5 text-slate-400">下書きはこの端末に保存されます。</p>
        </form>
      ) : tab === "medical" ? (
        <MedicalRecordsPage uid={uid ?? ""} records={medicalRecords} state={medicalState} requestedRecordId={requestedMedicalId} onRequestHandled={() => setRequestedMedicalId(null)} onToast={showToast} onDraftStatusChange={setMedicalDraftStatus} />
      ) : tab === "calendar" ? (
        <MonthlyCalendar uid={uid ?? ""} recordsByDate={recordsByDate} medicalRecords={medicalRecords} recordsState={historyState} onEdit={editRecord} onCreate={createRecordForDate} onOpenMedical={(recordId) => { setRequestedMedicalId(recordId); onTabChange("medical"); }} onToast={showToast} />
      ) : (
        <History records={records} state={historyState} onEdit={editRecord} />
      )}
      <Toast toast={toast} onClose={closeToast} />
    </section>
  );
}

function History({ records, state, onEdit }: { records: StoredWorkRecord[]; state: HistoryState; onEdit: (record: StoredWorkRecord) => void }) {
  return (
    <div className="min-h-[420px] p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-800">これまでの記録</h2>
      {state === "loading" ? <HistoryMessage title="記録を読み込んでいます…" /> : null}
      {state === "error" ? <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">記録を読み込めませんでした。通信状態を確認してください</p> : null}
      {state === "empty" ? <HistoryMessage title="記録はまだありません" description="「今日の記録」から保存すると、ここで振り返れます。" /> : null}
      {(state === "success" || (state === "error" && records.length > 0)) ? <div className="mt-4 space-y-3">{records.map((record) => <HistoryCard key={record.id} record={record} onEdit={() => onEdit(record)} />)}</div> : null}
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
      {expanded ? <div id={detailsId} className="mt-4 space-y-4 border-t border-slate-200 pt-4"><div><h3 className="text-sm font-bold text-slate-700">服薬</h3><dl className="mt-2 space-y-2">{medicationPeriods.map((period) => { const entry = record.medication[period.id]; return <div key={period.id} className="grid grid-cols-[2rem_4rem_1fr] gap-2 text-sm"><dt className="font-semibold text-slate-600">{period.label}</dt><dd className="text-slate-500">{formatMedicationStatus(entry.status)}</dd><dd className="break-words text-slate-500">{entry.note || "メモなし"}</dd></div>; })}</dl></div><div><h3 className="text-sm font-bold text-slate-700">起床時の体調</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{record.waking.conditionNote || "未入力"}</p></div><MeasureHistoryDetails record={record} /></div> : null}
    </article>
  );
}

function MeasureHistoryDetails({ record }: { record: WorkRecord }) {
  const todayItems = [
    ...record.todayMeasures.medications.flatMap((item, index) => item.detail || item.time
      ? [`服薬${index + 1}：${item.detail || "内容未入力"}${item.time ? `（${item.time}）` : ""}`]
      : []),
    ...record.todayMeasures.others.flatMap((item, index) => item ? [`その他${index + 1}：${item}`] : []),
  ];
  const futureItems = record.futureMeasures.filter((item) => item.action || item.execution || item.result);

  return <>
    <HistoryDetail title="対策" value={record.countermeasure} />
    <div><h3 className="text-sm font-bold text-slate-700">当日の対策</h3>{todayItems.length ? <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-500">{todayItems.map((item, index) => <li key={index} className="whitespace-pre-wrap">{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-400">記録なし</p>}</div>
    <div><h3 className="text-sm font-bold text-slate-700">今後の対策</h3>{futureItems.length ? <div className="mt-2 space-y-2">{futureItems.map((item, index) => <div key={index} className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-500"><p className="whitespace-pre-wrap"><span className="font-semibold text-slate-600">対策：</span>{item.action || "未入力"}</p><p><span className="font-semibold text-slate-600">実行：</span>{item.execution ? futureMeasureExecutionLabels[item.execution] : "未入力"}</p><p className="whitespace-pre-wrap"><span className="font-semibold text-slate-600">結果：</span>{item.result || "未入力"}</p></div>)}</div> : <p className="mt-2 text-sm text-slate-400">記録なし</p>}</div>
    <HistoryDetail title="メモ" value={record.memo} />
  </>;
}

function HistoryDetail({ title, value }: { title: string; value: string }) {
  return <div><h3 className="text-sm font-bold text-slate-700">{title}</h3><p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${value ? "text-slate-500" : "text-slate-400"}`}>{value || "記録なし"}</p></div>;
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
}

function scrollToForm(formRef: React.RefObject<HTMLFormElement | null>) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
}

function HistoryValue({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-0.5 font-semibold text-slate-700">{value}</dd></div>; }
function formatRating(value: number | null) { return value === null ? "未入力" : `${value} / 5`; }
function formatMedicationStatus(status: MedicationStatus) { if (status === "taken") return "有"; if (status === "not_taken") return "無"; return "未入力"; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="label">{label}</span>{children}</label>; }

type TimePairProps = { legend: string; start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void; disabled?: boolean; requiredStart?: boolean; requiredEnd?: boolean; };

function TimePair({ legend, start, end, onStart, onEnd, disabled = false, requiredStart = false, requiredEnd = false }: TimePairProps) {
  return <fieldset disabled={disabled} className={disabled ? "opacity-45" : ""}><legend className="label">{legend}{disabled ? <span className="ml-2 font-normal text-slate-400">（勤務のない区分のため入力不要）</span> : null}</legend><div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden"><input aria-label={`${legend}の開始`} required={requiredStart} type="time" value={start} onChange={(event) => onStart(event.target.value)} className="input min-w-0 max-w-full px-1 text-center sm:px-3" /><span className="text-slate-400">〜</span><input aria-label={`${legend}の終了`} required={requiredEnd} type="time" value={end} onChange={(event) => onEnd(event.target.value)} className="input min-w-0 max-w-full px-1 text-center sm:px-3" /></div></fieldset>;
}
