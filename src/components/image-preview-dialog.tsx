"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PreviewRecordImage = { date: string; blob: Blob; url: string; file: File };

export function ImagePreviewDialog({
  images,
  onClose,
  onToast,
}: {
  images: PreviewRecordImage[];
  onClose: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [sharing, setSharing] = useState(false);
  const allFiles = useMemo(() => images.map((image) => image.file), [images]);
  const canShareAll = canShareFiles(allFiles);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const dialog = closeButtonRef.current?.closest<HTMLElement>("[role=dialog]");
      const focusable = dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function share(files: File[]) {
    if (!canShareFiles(files)) return;
    setSharing(true);
    try {
      await navigator.share({ files, title: "仕事上の傾向と対策" });
      onToast("画像を共有しました", "success");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        onToast("画像を共有できませんでした。もう一度お試しください", "error");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="image-preview-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] bg-white p-4 shadow-2xl sm:rounded-[28px] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="image-preview-title" className="text-lg font-bold text-slate-800">記録画像のプレビュー</h2><p className="mt-1 text-sm text-slate-500">{images.length}枚のPNGを作成しました</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="画像プレビューを閉じる" className="relative z-10 min-h-11 min-w-11 shrink-0 touch-manipulation rounded-xl border border-slate-200 bg-white text-xl text-slate-600">×</button>
        </div>

        <div className="mt-4 rounded-2xl bg-teal-50 p-3 text-sm leading-6 text-teal-900">
          <p>iPhoneでは共有画面から「画像を保存」を選ぶと、写真アプリに保存できます。</p>
          <p className="mt-1">共有できない場合は、画像を長押しして保存メニューを開いてください。</p>
        </div>

        {canShareAll ? <button type="button" onClick={() => void share(allFiles)} disabled={sharing} className="mt-4 min-h-12 w-full rounded-xl bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50">{sharing ? "共有画面を開いています…" : "画像を共有・保存"}</button> : null}

        <div className="mt-5 space-y-5">
          {images.map((image) => {
            const canShareOne = canShareFiles([image.file]);
            return <article key={image.date} className="rounded-2xl border border-slate-200 p-3">
              <h3 className="text-sm font-bold text-slate-700">{formatDate(image.date)}</h3>
              {/* Blob URL points only to an in-memory image generated in this browser. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={`${formatAccessibleDate(image.date)}の記録画像`} className="mt-3 h-auto w-full border border-slate-200 bg-white" />
              {canShareOne && !canShareAll ? <button type="button" onClick={() => void share([image.file])} disabled={sharing} className="mt-3 min-h-11 w-full rounded-xl bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50">この画像を共有</button> : null}
            </article>;
          })}
        </div>

        {canShareAll ? <p className="mt-3 text-center text-xs leading-5 text-slate-500">共有後は、共有画面から「画像を保存」を選択してください。</p> : null}
      </section>
    </div>
  );
}

function canShareFiles(files: File[]) {
  return typeof navigator !== "undefined"
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files });
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatAccessibleDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
