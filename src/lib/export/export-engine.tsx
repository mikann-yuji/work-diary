"use client";

import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ExportCancelledError,
  ExportRuntimeError,
  canvasToPngBlob,
  captureExportPage,
  createOffscreenExportHost,
  removeOffscreenExportHost,
  releaseCanvas,
  throwIfAborted,
  waitForAnimationFrames,
  waitForExportElement,
  waitForExportFonts,
  waitForExportImages,
} from "@/lib/export/browser-export-runtime";

export type ExportRecordType = "work" | "medical";
export type ExportFormat = "pdf" | "png";
export type ExportStage = "validate" | "load-records" | "load-images" | "mount-layout" | "wait-dom" | "wait-fonts" | "wait-images" | "render-canvas" | "create-pdf" | "create-png" | "show-preview" | "cleanup" | "completed";
export type ExportProgress = { stage: ExportStage; current?: number; total?: number };
export type ExportPage<T> = { id: string; date: string; data: T };
export type LoadedAssets = { cleanup: () => void };

export type ExportAdapter<T, A extends LoadedAssets> = {
  recordType: ExportRecordType;
  densityLevels: number;
  pageSelector: string;
  contentSelector: string;
  sortPages: (pages: ExportPage<T>[]) => ExportPage<T>[];
  loadAssets: (page: ExportPage<T>, signal: AbortSignal, onProgress: (current: number, total: number) => void) => Promise<A>;
  renderPage: (page: ExportPage<T>, assets: A, density: number) => ReactNode;
  fitOverflow?: (content: HTMLElement) => boolean;
  getPageFileName: (page: ExportPage<T>) => string;
  getPdfFileName: (pages: ExportPage<T>[]) => string;
};

export type GeneratedExportImage = { id: string; date: string; blob: Blob; fileName: string };
export type ExportResult =
  | { format: "pdf"; blob: Blob; fileName: string }
  | { format: "png"; images: GeneratedExportImage[] };

export async function generateExport<T, A extends LoadedAssets>({ pages, adapter, format, signal, onProgress }: {
  pages: ExportPage<T>[];
  adapter: ExportAdapter<T, A>;
  format: ExportFormat;
  signal?: AbortSignal;
  onProgress: (progress: ExportProgress) => void;
}): Promise<ExportResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const sorted = adapter.sortPages(pages);
  let stage: ExportStage = "validate";
  const report = (next: ExportProgress) => {
    stage = next.stage;
    onProgress(next);
    trace(adapter.recordType, format, pages.length, next.stage, startedAt);
  };
  const timeoutMs = 30_000 + Math.max(0, sorted.length - 1) * 20_000;
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    report({ stage: "validate" });
    if (sorted.length === 0) throw new ExportRuntimeError("prepare-dom", "No records selected");
    throwIfAborted(controller.signal);
    report({ stage: "load-records", current: sorted.length, total: sorted.length });
    const html2canvas = (await import("html2canvas")).default;
    const pdf = format === "pdf" ? new (await import("jspdf")).jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true }) : null;
    const images: GeneratedExportImage[] = [];

    for (let index = 0; index < sorted.length; index += 1) {
      const pageData = sorted[index];
      throwIfAborted(controller.signal);
      report({ stage: "load-images", current: index + 1, total: sorted.length });
      const assets = await withStageTimeout(
        adapter.loadAssets(pageData, controller.signal, (current, total) => report({ stage: "load-images", current, total })),
        15_000,
        controller.signal,
      );
      const host = createOffscreenExportHost();
      const root = createRoot(host);
      let canvas: HTMLCanvasElement | null = null;
      try {
        report({ stage: "mount-layout", current: index + 1, total: sorted.length });
        let renderedPage: HTMLElement | null = null;
        for (let density = 0; density < adapter.densityLevels; density += 1) {
          root.render(adapter.renderPage(pageData, assets, density));
          report({ stage: "wait-dom", current: index + 1, total: sorted.length });
          renderedPage = await waitForExportElement(host, adapter.pageSelector, controller.signal);
          const content = await waitForExportElement(host, adapter.contentSelector, controller.signal);
          report({ stage: "wait-fonts", current: index + 1, total: sorted.length });
          await waitForExportFonts(renderedPage.ownerDocument, controller.signal);
          report({ stage: "wait-images", current: index + 1, total: sorted.length });
          await waitForExportImages(host, controller.signal);
          await waitForAnimationFrames(2, controller.signal);
          if (fits(renderedPage, content)) break;
          if (density === adapter.densityLevels - 1 && adapter.fitOverflow?.(content) !== true) {
            throw new ExportRuntimeError("prepare-dom", `${pageData.date} does not fit`);
          }
        }
        if (!renderedPage) throw new ExportRuntimeError("prepare-dom", "Export page was not mounted");
        await waitForAnimationFrames(2, controller.signal);
        report({ stage: "render-canvas", current: index + 1, total: sorted.length });
        canvas = await captureExportPage(renderedPage, html2canvas, controller.signal);
        if (format === "pdf") {
          report({ stage: "create-pdf", current: index + 1, total: sorted.length });
          if (index > 0) pdf?.addPage("a4", "portrait");
          pdf?.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
        } else {
          report({ stage: "create-png", current: index + 1, total: sorted.length });
          images.push({ id: pageData.id, date: pageData.date, blob: await canvasToPngBlob(canvas, controller.signal), fileName: adapter.getPageFileName(pageData) });
        }
      } finally {
        report({ stage: "cleanup", current: index + 1, total: sorted.length });
        if (canvas) releaseCanvas(canvas);
        root.unmount();
        removeOffscreenExportHost(host);
        assets.cleanup();
      }
    }
    report({ stage: "completed", current: sorted.length, total: sorted.length });
    return format === "pdf"
      ? { format, blob: pdf!.output("blob"), fileName: adapter.getPdfFileName(sorted) }
      : { format, images };
  } catch (error) {
    if (timedOut) throw new ExportRuntimeError(mapRuntimeStage(stage), "Export timed out", { cause: error, timedOut: true });
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function withStageTimeout<T>(promise: Promise<T>, milliseconds: number, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new ExportRuntimeError("wait-images", "wait-images timed out", { timedOut: true }))),
      milliseconds,
    );
    const onAbort = () => finish(() => reject(new ExportCancelledError()));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) return onAbort();
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

function fits(page: HTMLElement, content: HTMLElement) {
  return content.scrollHeight <= content.clientHeight + 1 && content.getBoundingClientRect().bottom <= page.getBoundingClientRect().bottom + 1;
}

function mapRuntimeStage(stage: ExportStage): "prepare-dom" | "wait-fonts" | "wait-images" | "render-canvas" | "create-blob" {
  if (stage === "wait-fonts") return "wait-fonts";
  if (stage === "load-images" || stage === "wait-images") return "wait-images";
  if (stage === "render-canvas") return "render-canvas";
  if (stage === "create-png") return "create-blob";
  return "prepare-dom";
}

function trace(recordType: ExportRecordType, exportType: ExportFormat, recordCount: number, stage: ExportStage, startedAt: number) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[export]", { exportType, recordType, recordCount, stage, elapsedMs: Math.round(performance.now() - startedAt) });
}
