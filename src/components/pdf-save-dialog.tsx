"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type PdfOutput = { blob: Blob; fileName: string };

export function PdfSaveDialog({ output, title, onClose, onToast }: {
  output: PdfOutput;
  title: string;
  onClose: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const [sharing, setSharing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const file = useMemo(() => new File([output.blob], output.fileName, { type: "application/pdf" }), [output]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); };
  }, [onClose]);

  async function sharePdf() {
    if (!canShare || sharing) return;
    setSharing(true);
    try {
      await navigator.share({ files: [file], title });
      onToast("PDFを共有しました", "success");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onToast("PDFを保存できませんでした。もう一度お試しください", "error");
    } finally { setSharing(false); }
  }

  function downloadPdf() {
    const url = URL.createObjectURL(output.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = output.fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }

  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="pdf-save-title" className="w-full max-w-md rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px]"><div className="flex items-start justify-between gap-3"><div><h2 id="pdf-save-title" className="text-lg font-bold text-slate-800">PDFを作成しました</h2><p className="mt-1 text-sm text-slate-500">共有画面またはダウンロードから保存できます。</p></div><button ref={closeRef} type="button" onClick={onClose} aria-label="PDF保存画面を閉じる" className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white text-xl text-slate-700">×</button></div><div className="mt-5 space-y-3">{canShare ? <button type="button" onClick={() => void sharePdf()} disabled={sharing} className="min-h-12 w-full rounded-xl bg-teal-700 px-4 font-bold text-white disabled:opacity-50">{sharing ? "共有画面を開いています…" : "PDFを共有・保存"}</button> : null}<button type="button" onClick={downloadPdf} className="min-h-12 w-full rounded-xl border border-teal-200 bg-white px-4 font-bold text-teal-800">PDFをダウンロード</button></div><p className="mt-4 text-xs leading-5 text-slate-500">iPhoneでは「PDFを共有・保存」から“ファイルに保存”を選べます。</p></section></div>, document.body);
}
