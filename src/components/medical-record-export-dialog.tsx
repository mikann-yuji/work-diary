"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePreviewDialog, type PreviewRecordImage } from "@/components/image-preview-dialog";
import { PdfSaveDialog, type PdfOutput } from "@/components/pdf-save-dialog";
import { ExportCancelledError, exportErrorMessage } from "@/lib/export/browser-export-runtime";
import { generateExport, type ExportProgress } from "@/lib/export/export-engine";
import { createMedicalExportAdapter, medicalExportPages } from "@/lib/export/export-adapters";
import type { StoredMedicalRecord } from "@/types/medical-record";

export type MedicalExportMode = "preview" | "pdf" | "image";

export function MedicalRecordExportDialog({ uid, records, mode = "image", onClose, onToast }: {
  uid: string;
  records: StoredMedicalRecord[];
  mode?: MedicalExportMode;
  onClose: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const actualMode = mode === "pdf" ? "pdf" : "png";
  const [progress, setProgress] = useState<ExportProgress>({ stage: "validate" });
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [pdfOutput, setPdfOutput] = useState<PdfOutput | null>(null);
  const [previewImages, setPreviewImages] = useState<PreviewRecordImage[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      try {
        const output = await generateExport({
          pages: medicalExportPages(records),
          adapter: createMedicalExportAdapter(uid),
          format: actualMode,
          signal: controller.signal,
          onProgress: (value) => { if (active) setProgress(value); },
        });
        if (!active) return;
        if (output.format === "pdf") {
          if (!active) return;
          setPdfOutput({ blob: output.blob, fileName: output.fileName });
          onToast("PDFを作成しました", "success");
        } else {
          setPreviewImages(output.images.map((image) => ({
            id: image.id,
            date: image.date,
            blob: image.blob,
            url: URL.createObjectURL(image.blob),
            file: new File([image.blob], image.fileName, { type: "image/png" }),
          })));
          onToast("画像を作成しました", "success");
        }
      } catch (error) {
        if (!active || error instanceof ExportCancelledError) return;
        setFailed(true);
        onToast(exportErrorMessage(error, actualMode === "pdf" ? "PDF" : "PNG画像"), "error");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  // The selected records and mode are fixed while this export request is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  useEffect(() => () => {
    previewImages?.forEach((image) => URL.revokeObjectURL(image.url));
  }, [previewImages]);

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  if (pdfOutput) return <PdfSaveDialog output={pdfOutput} title="通院記録" onClose={close} onToast={onToast} />;
  if (previewImages) return <ImagePreviewDialog images={previewImages} onClose={close} onToast={onToast} />;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="medical-export-status" className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="medical-export-status" className="pt-2 text-base font-bold text-slate-800">{actualMode === "pdf" ? "PDFを作成" : "画像を作成"}</h2>
          <button ref={closeRef} type="button" onClick={close} aria-label="出力処理を閉じる" className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white text-xl text-slate-700">×</button>
        </div>
        {busy ? <div className="flex min-h-44 flex-col items-center justify-center gap-4" aria-live="polite"><span role="status" aria-label="出力中" className="h-9 w-9 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" /><p className="text-center font-semibold text-teal-900">{medicalProgressLabel(progress, actualMode)}</p><button type="button" onClick={close} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700">中止</button></div> : null}
        {failed && !busy ? <div className="mt-4"><p role="alert" className="rounded-2xl bg-rose-50 p-4 text-center text-sm font-semibold text-rose-800">通院記録を出力できませんでした</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setBusy(true); setFailed(false); setRetryKey((value) => value + 1); }} className="min-h-11 rounded-xl bg-teal-700 px-3 font-bold text-white">再試行</button><button type="button" onClick={close} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-700">閉じる</button></div></div> : null}
      </section>
    </div>,
    document.body,
  );
}

function medicalProgressLabel(progress: ExportProgress, format: "pdf" | "png") {
  const suffix = progress.total ? `（${progress.current ?? 0}/${progress.total}）` : "";
  if (progress.stage === "load-records") return `通院記録を読み込んでいます${suffix}`;
  if (progress.stage === "load-images" || progress.stage === "wait-images") return `添付画像を読み込んでいます${suffix}`;
  if (progress.stage === "mount-layout" || progress.stage === "wait-dom" || progress.stage === "wait-fonts") return `出力画面を準備しています${suffix}`;
  return `${format === "pdf" ? "PDF" : "PNG画像"}を作成しています${suffix}`;
}
