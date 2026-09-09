"use client";

export type ExportStage = "prepare-dom" | "wait-fonts" | "wait-images" | "render-canvas" | "create-blob";

export class ExportRuntimeError extends Error {
  public readonly timedOut: boolean;

  constructor(public readonly stage: ExportStage, message: string, options?: ErrorOptions & { timedOut?: boolean }) {
    super(message, options);
    this.name = "ExportRuntimeError";
    this.timedOut = options?.timedOut ?? false;
  }
}

export class ExportCancelledError extends Error {
  constructor() {
    super("Export was cancelled");
    this.name = "ExportCancelledError";
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportCancelledError();
}

export function withExportTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  stage: ExportStage,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new ExportCancelledError()));
    const timer = window.setTimeout(
      () => finish(() => reject(new ExportRuntimeError(stage, `${stage} timed out`, { timedOut: true }))),
      milliseconds,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(
        error instanceof ExportRuntimeError || error instanceof ExportCancelledError
          ? error
          : new ExportRuntimeError(stage, `${stage} failed`, { cause: error }),
      )),
    );
  });
}

export async function waitForExportFonts(signal?: AbortSignal) {
  throwIfAborted(signal);
  if (!document.fonts) return;
  try {
    await withExportTimeout(document.fonts.ready, 5_000, "wait-fonts", signal);
  } catch (error) {
    // iPhone Safari/PWA can leave document.fonts.ready pending even when the
    // system Japanese font is already drawable. Font readiness is therefore
    // best-effort; cancellation must still stop the export immediately.
    if (error instanceof ExportCancelledError) throw error;
  }
}

export async function waitForAnimationFrames(count = 2, signal?: AbortSignal) {
  for (let index = 0; index < count; index += 1) {
    throwIfAborted(signal);
    await withExportTimeout(new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), 2_000, "prepare-dom", signal);
  }
}

export async function waitForExportElement<T extends HTMLElement>(host: HTMLElement, selector: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  const existing = host.querySelector<T>(selector);
  if (existing) return existing;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(() => reject(new ExportRuntimeError("prepare-dom", "Export DOM timed out"))), 5_000);
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      observer.disconnect();
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const observer = new MutationObserver(() => {
      const element = host.querySelector<T>(selector);
      if (!element) return;
      finish(() => resolve(element));
    });
    const onAbort = () => finish(() => reject(new ExportCancelledError()));
    observer.observe(host, { childList: true, subtree: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForExportImages(container: HTMLElement, signal?: AbortSignal) {
  const images = Array.from(container.querySelectorAll("img"));
  if (images.length === 0) return;
  await withExportTimeout(Promise.all(images.map((image) => waitForImage(image, signal))).then(() => undefined), 15_000, "wait-images", signal);
}

async function waitForImage(image: HTMLImageElement, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (image.complete) {
    if (image.naturalWidth === 0) throw new ExportRuntimeError("wait-images", "Image could not be decoded");
    if (typeof image.decode === "function") await image.decode().catch(() => undefined);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(() => reject(new ExportRuntimeError("wait-images", "Image loading timed out"))), 15_000);
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      callback();
    };
    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onLoad = () => finish(resolve);
    const onError = () => finish(() => reject(new ExportRuntimeError("wait-images", "Image failed to load")));
    const onAbort = () => finish(() => reject(new ExportCancelledError()));
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  if (typeof image.decode === "function") await image.decode().catch(() => undefined);
}

export async function captureExportPage(
  page: HTMLElement,
  html2canvas: typeof import("html2canvas")["default"],
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const width = page.clientWidth;
  const height = page.clientHeight;
  if (!width || !height) throw new ExportRuntimeError("render-canvas", "Export page has no size");
  // About 1240px wide (roughly 150dpi for A4) is readable while avoiding the
  // very large 2x canvases that frequently exhaust memory in iPhone PWAs.
  const scale = Math.max(1, Math.min(1.6, 1240 / width));
  return withExportTimeout(html2canvas(page, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: false,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
  }), 30_000, "render-canvas", signal);
}

export function canvasToPngBlob(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  throwIfAborted(signal);
  return withExportTimeout(new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new ExportRuntimeError("create-blob", "Canvas returned an empty PNG")), "image/png");
  }), 10_000, "create-blob", signal);
}

export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 1;
  canvas.height = 1;
}

export function createOffscreenExportHost() {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "297mm",
    pointerEvents: "none",
    visibility: "visible",
    zIndex: "-1",
  });
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  return host;
}

export function exportErrorMessage(error: unknown, format: "PDF" | "PNG画像") {
  if (error instanceof ExportRuntimeError) {
    if (error.stage === "prepare-dom") return "出力用画面を準備できませんでした";
    if (error.stage === "wait-images") {
      return error.timedOut ? "添付画像の読み込みがタイムアウトしました" : "添付画像を読み込めませんでした";
    }
    if (error.stage === "render-canvas" && error.timedOut) return `${format}の生成がタイムアウトしました`;
  }
  return `${format}の生成に失敗しました`;
}
