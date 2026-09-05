"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/wellness-sections";
import { getLocalDateString } from "@/lib/calendar";
import { createMedicalRecordId, saveMedicalRecord } from "@/lib/firestore/medical-records";
import {
  deleteMedicalImage,
  getMedicalImageBlob,
  prepareMedicalImage,
  UnsupportedMedicalImageError,
  uploadMedicalImage,
} from "@/lib/storage/medical-images";
import type { MedicalImageKind, MedicalImageReference, MedicalRecordInput, ReservationStatus, StoredMedicalRecord, VisitMethod } from "@/types/medical-record";

type RecordsState = "loading" | "empty" | "success" | "error";
type FormState = Omit<MedicalRecordInput, "prescriptionImages" | "medicationGuideImages">;
type PendingImage = { id: string; blob: Blob; url: string };
type Errors = Partial<Record<"visitDate" | "department" | "visitMethod" | "reservationDeadline" | "reservationStatus" | "appointmentDateTime", string>>;

const visitMethods: Array<{ id: VisitMethod; label: string }> = [{ id: "initial", label: "初診" }, { id: "followUp", label: "再診" }, { id: "online", label: "オンライン" }];
const reservationOptions: Array<{ id: Exclude<ReservationStatus, null>; label: string }> = [{ id: "unbooked", label: "未予約" }, { id: "booked", label: "予約済み" }];

export function MedicalRecordsPage({ uid, records, state, requestedRecordId, onRequestHandled, onToast }: { uid: string; records: StoredMedicalRecord[]; state: RecordsState; requestedRecordId: string | null; onRequestHandled: () => void; onToast: (message: string, type: "success" | "error") => void }) {
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingPrescription, setExistingPrescription] = useState<MedicalImageReference[]>([]);
  const [existingGuides, setExistingGuides] = useState<MedicalImageReference[]>([]);
  const [pendingPrescription, setPendingPrescription] = useState<PendingImage[]>([]);
  const [pendingGuides, setPendingGuides] = useState<PendingImage[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [preparingImages, setPreparingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef<PendingImage[]>([]);
  pendingRef.current = [...pendingPrescription, ...pendingGuides];

  useEffect(() => () => pendingRef.current.forEach((image) => URL.revokeObjectURL(image.url)), []);
  useEffect(() => {
    if (!requestedRecordId) return;
    const record = records.find((item) => item.id === requestedRecordId);
    if (record) loadRecord(record);
    onRequestHandled();
  // Loading an explicitly requested record is an event driven by its id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRecordId, records]);

  function update(patch: Partial<FormState>) { setForm((current) => ({ ...current, ...patch })); }
  function replacePending(setter: React.Dispatch<React.SetStateAction<PendingImage[]>>, next: PendingImage[]) {
    setter((current) => { current.forEach((item) => URL.revokeObjectURL(item.url)); return next; });
  }

  function resetForm() {
    replacePending(setPendingPrescription, []);
    replacePending(setPendingGuides, []);
    setForm(createInitialForm());
    setEditingId(null);
    setExistingPrescription([]);
    setExistingGuides([]);
    setRemovedPaths([]);
    setErrors({});
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function loadRecord(record: StoredMedicalRecord) {
    replacePending(setPendingPrescription, []);
    replacePending(setPendingGuides, []);
    setForm({
      visitDate: record.visitDate, department: record.department, hospitalName: record.hospitalName,
      hasNextVisit: record.hasNextVisit, reservationDeadline: record.reservationDeadline,
      reservationStatus: record.reservationStatus, appointmentDateTime: record.appointmentDateTime,
      visitMethod: record.visitMethod, background: record.background, symptomDuration: record.symptomDuration,
      diagnosis: record.diagnosis, prescription: record.prescription, memo: record.memo,
    });
    setEditingId(record.id);
    setExistingPrescription(record.prescriptionImages);
    setExistingGuides(record.medicationGuideImages);
    setRemovedPaths([]);
    setErrors({});
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function setHasNextVisit(value: boolean) {
    update(value ? { hasNextVisit: true } : { hasNextVisit: false, reservationDeadline: null, reservationStatus: null, appointmentDateTime: null });
  }

  function setReservationStatus(value: Exclude<ReservationStatus, null>) {
    update(value === "booked" ? { reservationStatus: value } : { reservationStatus: value, appointmentDateTime: null });
  }

  async function selectImages(files: FileList | null, kind: MedicalImageKind) {
    if (!files?.length || preparingImages) return;
    const existing = kind === "prescriptions" ? existingPrescription : existingGuides;
    const pending = kind === "prescriptions" ? pendingPrescription : pendingGuides;
    const setter = kind === "prescriptions" ? setPendingPrescription : setPendingGuides;
    const available = Math.max(0, 2 - existing.length - pending.length);
    const selected = [...files].slice(0, available);
    const prepared: PendingImage[] = [];
    setPreparingImages(true);
    try {
      for (const file of selected) {
        const blob = await prepareMedicalImage(file);
        prepared.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) });
      }
      setter((current) => [...current, ...prepared]);
    } catch (error) {
      prepared.forEach((image) => URL.revokeObjectURL(image.url));
      if (error instanceof UnsupportedMedicalImageError) onToast("画像を読み込めませんでした。JPEG、PNGなど対応している画像を選び直してください", "error");
      else onToast("画像を準備できませんでした", "error");
    } finally {
      setPreparingImages(false);
    }
  }

  function removeExisting(image: MedicalImageReference, kind: MedicalImageKind) {
    if (kind === "prescriptions") setExistingPrescription((current) => current.filter((item) => item.id !== image.id));
    else setExistingGuides((current) => current.filter((item) => item.id !== image.id));
    setRemovedPaths((current) => [...current, image.path]);
  }

  function removePending(id: string, kind: MedicalImageKind) {
    const setter = kind === "prescriptions" ? setPendingPrescription : setPendingGuides;
    setter((current) => current.filter((item) => { if (item.id === id) URL.revokeObjectURL(item.url); return item.id !== id; }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (savingRef.current || preparingImages) return;
    savingRef.current = true;
    setSaving(true);
    const recordId = editingId ?? createMedicalRecordId(uid);
    const uploaded: MedicalImageReference[] = [];
    const pendingGroups = [{ kind: "prescriptions" as const, images: pendingPrescription }, { kind: "medication-guides" as const, images: pendingGuides }];
    const total = pendingPrescription.length + pendingGuides.length;
    let completed = 0;
    try {
      const uploadedByKind: Record<MedicalImageKind, MedicalImageReference[]> = { prescriptions: [], "medication-guides": [] };
      for (const group of pendingGroups) for (const image of group.images) {
        const reference = await uploadMedicalImage(uid, recordId, group.kind, image.blob, (part) => setUploadProgress(total ? Math.round(((completed + part) / total) * 100) : null));
        uploaded.push(reference);
        uploadedByKind[group.kind].push(reference);
        completed += 1;
      }
      const input = sanitizeForSave(form, [...existingPrescription, ...uploadedByKind.prescriptions], [...existingGuides, ...uploadedByKind["medication-guides"]]);
      const result = await saveMedicalRecord(uid, recordId, input);
      await Promise.all(removedPaths.map(deleteMedicalImage));
      replacePending(setPendingPrescription, []);
      replacePending(setPendingGuides, []);
      setExistingPrescription(input.prescriptionImages);
      setExistingGuides(input.medicationGuideImages);
      setRemovedPaths([]);
      setEditingId(recordId);
      onToast(result.created ? "通院記録を保存しました" : "通院記録を更新しました", "success");
    } catch {
      await Promise.all(uploaded.map((image) => deleteMedicalImage(image.path)));
      onToast("通院記録を保存できませんでした", "error");
    } finally {
      setUploadProgress(null);
      setSaving(false);
      savingRef.current = false;
    }
  }

  const weekday = formatWeekday(form.visitDate);
  return <div className="space-y-5 bg-slate-50/50 p-4 sm:p-5">
    <form ref={formRef} onSubmit={submit} className="space-y-5" aria-busy={saving}>
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-800">通院記録</h1><p className="mt-1 text-sm text-slate-500">{editingId ? "保存済みの記録を編集中" : "新しい通院記録"}</p></div>{editingId ? <button type="button" onClick={resetForm} disabled={saving} className="min-h-11 rounded-xl border border-teal-200 bg-white px-3 text-sm font-bold text-teal-800">新規作成</button> : null}</div>
      <SectionCard title="基本情報" description="必須項目には「必須」と表示しています。"><div className="space-y-4">
        <Field label="通院した日付" required error={errors.visitDate}><div className="input flex items-center gap-2"><input type="date" value={form.visitDate} onChange={(e) => update({ visitDate: e.target.value })} className="min-w-0 flex-1 bg-transparent outline-none" /><span className="shrink-0 text-sm font-bold text-teal-800">{weekday}</span></div></Field>
        <Field label="区分・診療科" required error={errors.department}><input value={form.department} onChange={(e) => update({ department: e.target.value })} placeholder="例：精神科、内科" className="input" /></Field>
        <Field label="病院名"><input value={form.hospitalName} onChange={(e) => update({ hospitalName: e.target.value })} className="input" /></Field>
        <ChoiceField legend="次回の通院" value={form.hasNextVisit === null ? null : String(form.hasNextVisit)} options={[{ id: "true", label: "有" }, { id: "false", label: "無" }]} onSelect={(id) => setHasNextVisit(id === "true")} />
        {form.hasNextVisit ? <div className="space-y-4 rounded-2xl bg-teal-50/60 p-3"><Field label="予約する期限" required error={errors.reservationDeadline}><input type="date" value={form.reservationDeadline ?? ""} onChange={(e) => update({ reservationDeadline: e.target.value || null })} className="input" /></Field><ChoiceField legend="予約状況" required value={form.reservationStatus} options={reservationOptions} onSelect={(id) => setReservationStatus(id as Exclude<ReservationStatus, null>)} error={errors.reservationStatus} />{form.reservationStatus === "booked" ? <Field label="予約日時" required error={errors.appointmentDateTime}><input type="datetime-local" value={form.appointmentDateTime ?? ""} onChange={(e) => update({ appointmentDateTime: e.target.value || null })} className="input" /></Field> : null}</div> : null}
        <ChoiceField legend="受診方法" required value={form.visitMethod} options={visitMethods} onSelect={(id) => update({ visitMethod: id as VisitMethod })} error={errors.visitMethod} />
      </div></SectionCard>
      <SectionCard title="詳細情報" description="わかる範囲で記録できます。"><div className="space-y-4"><TextArea label="通院の経緯" value={form.background} onChange={(background) => update({ background })} /><Field label="症状の長さ"><input value={form.symptomDuration} onChange={(e) => update({ symptomDuration: e.target.value })} placeholder="例：3日間、2週間程度" className="input" /></Field><TextArea label="診断" value={form.diagnosis} onChange={(diagnosis) => update({ diagnosis })} /><TextArea label="処方" value={form.prescription} onChange={(prescription) => update({ prescription })} /><TextArea label="メモ" value={form.memo} onChange={(memo) => update({ memo })} /></div></SectionCard>
      <SectionCard title="画像" description="画像は端末内で縮小し、本人だけがアクセスできるStorageへ保存します。"><div className="space-y-5"><ImagePicker title="処方箋の画像" kind="prescriptions" existing={existingPrescription} pending={pendingPrescription} disabled={saving || preparingImages} onSelect={selectImages} onRemoveExisting={removeExisting} onRemovePending={removePending} /><ImagePicker title="薬の説明書の画像" kind="medication-guides" existing={existingGuides} pending={pendingGuides} disabled={saving || preparingImages} onSelect={selectImages} onRemoveExisting={removeExisting} onRemovePending={removePending} /></div>{preparingImages ? <p role="status" className="mt-3 text-sm font-bold text-teal-800">画像を準備しています…</p> : null}</SectionCard>
      {uploadProgress !== null ? <p className="text-center text-sm font-bold text-teal-800" aria-live="polite">画像をアップロードしています（{uploadProgress}%）</p> : null}
      <button type="submit" disabled={saving || preparingImages} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-teal-700 px-5 text-base font-bold text-white shadow-lg shadow-teal-900/15 disabled:cursor-wait disabled:opacity-55">{saving ? <><span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-teal-200 border-t-white" />保存しています…</> : editingId ? "通院記録を更新" : "通院記録を保存"}</button>
    </form>
    <MedicalRecordList records={records} state={state} onEdit={loadRecord} />
  </div>;
}

function ImagePicker({ title, kind, existing, pending, disabled, onSelect, onRemoveExisting, onRemovePending }: { title: string; kind: MedicalImageKind; existing: MedicalImageReference[]; pending: PendingImage[]; disabled: boolean; onSelect: (files: FileList | null, kind: MedicalImageKind) => void; onRemoveExisting: (image: MedicalImageReference, kind: MedicalImageKind) => void; onRemovePending: (id: string, kind: MedicalImageKind) => void }) {
  const count = existing.length + pending.length;
  return <fieldset><legend className="label">{title} <span className="font-normal text-slate-400">（最大2枚・任意）</span></legend><div className="grid grid-cols-2 gap-3">{existing.map((image, index) => <SavedImage key={image.id} image={image} alt={`${title}${index + 1}`} onRemove={() => onRemoveExisting(image, kind)} disabled={disabled} />)}{pending.map((image, index) => <ImageTile key={image.id} url={image.url} alt={`選択した${title}${existing.length + index + 1}`} onRemove={() => onRemovePending(image.id, kind)} disabled={disabled} />)}{count < 2 ? <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-200 bg-white p-3 text-center text-sm font-bold text-teal-800"><span className="text-2xl">＋</span><span className="mt-1">画像を選択・撮影</span><input type="file" accept="image/*" multiple disabled={disabled} onChange={(e) => { void onSelect(e.target.files, kind); e.target.value = ""; }} className="sr-only" /></label> : null}</div></fieldset>;
}

function SavedImage({ image, alt, onRemove, disabled }: { image: MedicalImageReference; alt: string; onRemove: () => void; disabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; let objectUrl: string | null = null; void getMedicalImageBlob(image.path).then((blob) => { if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [image.path]);
  if (failed) return <div role="alert" className="flex min-h-32 items-center justify-center rounded-2xl bg-rose-50 p-3 text-center text-xs text-rose-700">画像を読み込めませんでした</div>;
  return url ? <ImageTile url={url} alt={alt} onRemove={onRemove} disabled={disabled} /> : <div role="status" aria-label={`${alt}を読み込み中`} className="flex min-h-32 items-center justify-center rounded-2xl bg-slate-100 text-xs text-slate-500">読み込み中</div>;
}

function ImageTile({ url, alt, onRemove, disabled }: { url: string; alt: string; onRemove: () => void; disabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <div className="relative min-h-32 overflow-hidden rounded-2xl border border-slate-200 bg-white"><button type="button" onClick={() => setExpanded(true)} className="relative h-32 w-full"><Image src={url} alt={alt} fill unoptimized className="object-cover" /></button><button type="button" onClick={onRemove} disabled={disabled} aria-label={`${alt}を削除`} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/75 text-xl text-white">×</button>{expanded ? <ImageLightbox url={url} alt={alt} onClose={() => setExpanded(false)} /> : null}</div>;
}

function ImageLightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; closeRef.current?.focus(); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", keydown); return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); }; }, [onClose]);
  return <div role="dialog" aria-modal="true" aria-label={`${alt}の拡大表示`} className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-4"><button ref={closeRef} type="button" onClick={onClose} aria-label="拡大画像を閉じる" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 h-11 w-11 rounded-full bg-white text-xl text-slate-800">×</button><div className="relative h-full w-full"><Image src={url} alt={alt} fill unoptimized className="object-contain" /></div></div>;
}

function MedicalRecordList({ records, state, onEdit }: { records: StoredMedicalRecord[]; state: RecordsState; onEdit: (record: StoredMedicalRecord) => void }) {
  return <section className="rounded-[22px] border border-slate-100 bg-white p-4"><h2 className="text-lg font-bold text-slate-800">保存済みの通院記録</h2>{state === "loading" ? <p className="mt-4 text-sm text-slate-500">読み込み中…</p> : null}{state === "error" ? <p role="alert" className="mt-4 text-sm text-rose-700">通院記録を読み込めませんでした</p> : null}{state === "empty" ? <p className="mt-4 text-sm text-slate-500">通院記録はまだありません</p> : null}<div className="mt-3 space-y-2">{records.map((record) => <button key={record.id} type="button" onClick={() => onEdit(record)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left"><span className="text-sm font-bold text-slate-800">{formatDate(record.visitDate)}</span><span className="mt-1 block text-sm font-semibold text-teal-800">{record.department}</span><span className="mt-1 block truncate text-xs text-slate-500">{record.hospitalName || "病院名未入力"}</span><span className="mt-2 block text-xs text-slate-500">次回通院：{record.hasNextVisit === null ? "未入力" : record.hasNextVisit ? "有" : "無"}{record.appointmentDateTime ? `　予約：${formatDateTime(record.appointmentDateTime)}` : ""}</span></button>)}</div></section>;
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) { return <label className="block"><span className="label">{label}{required ? <span className="ml-2 text-xs text-rose-600">必須</span> : <span className="ml-2 font-normal text-slate-400">（任意）</span>}</span>{children}{error ? <span className="mt-1 block text-sm text-rose-700">{error}</span> : null}</label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="input min-h-28 resize-y py-3" /></Field>; }
function ChoiceField<T extends string>({ legend, required, value, options, onSelect, error }: { legend: string; required?: boolean; value: T | null; options: Array<{ id: T; label: string }>; onSelect: (id: T) => void; error?: string }) { return <fieldset><legend className="label">{legend}{required ? <span className="ml-2 text-xs text-rose-600">必須</span> : <span className="ml-2 font-normal text-slate-400">（任意）</span>}</legend><div className={`grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{options.map((option) => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onSelect(option.id)} className={`min-h-12 rounded-xl border font-bold ${value === option.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{option.label}</button>)}</div>{error ? <p className="mt-1 text-sm text-rose-700">{error}</p> : null}</fieldset>; }

function createInitialForm(): FormState { return { visitDate: getLocalDateString(), department: "", hospitalName: "", hasNextVisit: null, reservationDeadline: null, reservationStatus: null, appointmentDateTime: null, visitMethod: null, background: "", symptomDuration: "", diagnosis: "", prescription: "", memo: "" }; }
function validate(form: FormState): Errors { const errors: Errors = {}; if (!form.visitDate) errors.visitDate = "通院した日付を入力してください"; if (!form.department.trim()) errors.department = "区分・診療科を入力してください"; if (!form.visitMethod) errors.visitMethod = "受診方法を選択してください"; if (form.hasNextVisit) { if (!form.reservationDeadline) errors.reservationDeadline = "予約する期限を入力してください"; if (!form.reservationStatus) errors.reservationStatus = "予約状況を選択してください"; if (form.reservationStatus === "booked" && !form.appointmentDateTime) errors.appointmentDateTime = "予約日時を入力してください"; } return errors; }
function sanitizeForSave(form: FormState, prescriptionImages: MedicalImageReference[], medicationGuideImages: MedicalImageReference[]): MedicalRecordInput { return { ...form, department: form.department.trim(), hospitalName: form.hospitalName.trim(), reservationDeadline: form.hasNextVisit ? form.reservationDeadline : null, reservationStatus: form.hasNextVisit ? form.reservationStatus : null, appointmentDateTime: form.hasNextVisit && form.reservationStatus === "booked" ? form.appointmentDateTime : null, prescriptionImages, medicationGuideImages }; }
function formatWeekday(date: string) { return date ? `（${new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(new Date(`${date}T00:00:00`))}）` : ""; }
function formatDate(date: string) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
