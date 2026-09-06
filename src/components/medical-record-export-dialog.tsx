"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MedicalAttachmentLoadError, prepareMedicalRecords } from "@/lib/export/medical-record-export";
import { generateMedicalRecordImages, type MedicalRecordImage } from "@/lib/image/generate-medical-record-images";
import type { StoredMedicalRecord } from "@/types/medical-record";

type PreviewImage = MedicalRecordImage & { url: string; file: File };
type Progress = { label: string; current?: number; total?: number };

export function MedicalRecordExportDialog({ uid, records, onClose, onToast }: {
  uid: string;
  records: StoredMedicalRecord[];
  onClose: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [progress, setProgress] = useState<Progress>({ label: "通院記録を読み込んでいます" });
  const [busy, setBusy] = useState(true);
  const [imageMode, setImageMode] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cleanupAttachmentsRef = useRef<(() => void) | null>(null);
  const imagesRef = useRef<PreviewImage[]>([]);
  useEffect(() => { imagesRef.current = images; }, [images]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await prepareMedicalRecords(uid, records, (current, total) => {
          if (!cancelled) setProgress({ label: "画像を読み込んでいます", current, total });
        });
        if (cancelled) { bundle.cleanup(); return; }
        cleanupAttachmentsRef.current = bundle.cleanup;
        const generated = await generateMedicalRecordImages(bundle.prepared, (current, total) => {
          if (!cancelled) setProgress({ label: "プレビューを作成しています", current, total });
        });
        if (cancelled) return;
        setImages(generated.map((image) => ({
          ...image,
          url: URL.createObjectURL(image.blob),
          file: new File([image.blob], image.fileName, { type: "image/png" }),
        })));
      } catch (error) {
        if (!cancelled) {
          setLoadFailed(true);
          onToast(error instanceof MedicalAttachmentLoadError ? "添付画像を読み込めませんでした" : "通院記録を出力できませんでした", "error");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanupAttachmentsRef.current?.();
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    };
  // The selected record snapshot is intentionally fixed for the lifetime of the dialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>("[data-medical-export-dialog]");
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", onKeyDown); };
  }, [busy, onClose]);

  const hasCompactPage = useMemo(() => images.some((image) => image.compact), [images]);

  function approveCompactOutput() {
    return !hasCompactPage || window.confirm("入力内容が多いため、文字や画像が小さくなります。\n1ページに収めて出力しますか？");
  }

  async function savePdf() {
    if (busy || !images.length || !approveCompactOutput()) return;
    setBusy(true);
    setProgress({ label: "PDFを作成しています", current: 0, total: images.length });
    try {
      const { generateMedicalRecordsPdf } = await import("@/lib/pdf/generate-medical-records-pdf");
      await generateMedicalRecordsPdf(images, (current, total) => setProgress({ label: "PDFを作成しています", current, total }));
      onToast("PDFを保存しました", "success");
    } catch {
      onToast("通院記録を出力できませんでした", "error");
    } finally { setBusy(false); }
  }

  async function shareImages(target?: PreviewImage) {
    if (busy || !approveCompactOutput()) return;
    const targets = target ? [target] : images;
    if (!navigator.share || !navigator.canShare?.({ files: targets.map((image) => image.file) })) {
      setImageMode(true);
      onToast("この端末では共有できないため、PNGをダウンロードしてください", "error");
      return;
    }
    setBusy(true);
    setProgress({ label: "共有画面を開いています" });
    try {
      await navigator.share({ files: targets.map((image) => image.file), title: "通院記録" });
      onToast("画像を共有しました", "success");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onToast("画像を共有できませんでした。もう一度お試しください", "error");
    } finally { setBusy(false); }
  }

  function downloadImage(image: PreviewImage) {
    const anchor = document.createElement("a");
    anchor.href = image.url;
    anchor.download = image.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function printRecords() {
    if (busy || !images.length || !approveCompactOutput()) return;
    window.print();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/65 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section data-medical-export-dialog role="dialog" aria-modal="true" aria-labelledby="medical-export-title" className="mx-auto max-w-4xl rounded-3xl bg-slate-50 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-3xl border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
          <div className="min-w-0"><h2 id="medical-export-title" className="font-bold text-slate-900">通院記録の出力プレビュー</h2><p className="text-xs text-slate-500">{records.length}件・{records.length}ページ</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} aria-label="出力プレビューを閉じる" className="h-11 w-11 rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-700 disabled:opacity-40">×</button>
        </header>

        <div className="p-4 sm:p-6 print:p-0">
          {busy ? <div className="flex min-h-64 flex-col items-center justify-center gap-4" aria-live="polite"><span role="status" aria-label="読み込み中" className="h-9 w-9 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" /><p className="font-semibold text-teal-900">{progress.label}{progress.total ? `（${progress.current ?? 0}/${progress.total}）` : ""}</p></div> : null}
          {loadFailed && !busy ? <p className="rounded-2xl bg-rose-50 p-4 text-center text-sm font-semibold text-rose-800">通院記録を出力できませんでした</p> : null}
          {!busy && images.length ? <>
            {hasCompactPage ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">入力内容が多いため、文字や画像が小さくなります。出力時に確認できます。</p> : null}
            <div className="medical-export-controls mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden">
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-700">戻る</button>
              <button type="button" onClick={() => void savePdf()} className="min-h-11 rounded-xl bg-teal-700 px-3 font-bold text-white">PDFとして保存</button>
              <button type="button" onClick={() => setImageMode(true)} className="min-h-11 rounded-xl bg-cyan-700 px-3 font-bold text-white">画像として保存</button>
              <button type="button" onClick={printRecords} className="min-h-11 rounded-xl bg-slate-700 px-3 font-bold text-white">印刷</button>
            </div>
            {imageMode ? <div className="medical-export-controls mb-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 print:hidden">
              <p className="text-sm text-cyan-950">iPhoneでは共有画面から「画像を保存」を選ぶと、写真アプリに保存できます</p>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void shareImages()} className="min-h-11 rounded-xl bg-cyan-700 px-4 font-bold text-white">画像を共有・保存</button><button type="button" onClick={() => setImageMode(false)} className="min-h-11 rounded-xl border border-cyan-200 bg-white px-4 font-bold text-cyan-900">閉じる</button></div>
            </div> : null}
            <div className="space-y-5 print:space-y-0" data-medical-print-root>
              {images.map((image) => <figure key={image.recordId} className="medical-print-page mx-auto max-w-[720px] overflow-hidden bg-white shadow-lg print:max-w-none print:shadow-none"><img src={image.url} alt={`${formatDate(image.date)}の通院記録画像`} className="block aspect-[210/297] h-auto w-full bg-white" />{imageMode ? <figcaption className="medical-export-controls flex flex-wrap gap-2 border-t border-slate-200 p-3 print:hidden"><button type="button" onClick={() => void shareImages(image)} className="min-h-11 rounded-xl border border-cyan-200 bg-white px-3 text-sm font-bold text-cyan-900">この画像を共有</button><button type="button" onClick={() => downloadImage(image)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">PNGをダウンロード</button></figcaption> : null}</figure>)}
            </div>
          </> : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
