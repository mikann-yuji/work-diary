"use client";

import { createRoot, type Root } from "react-dom/client";
import { DailyRecordPdfPage, PDF_DENSITY_LEVELS } from "@/components/daily-record-pdf-page";
import type { StoredWorkRecord } from "@/lib/firestore/records";
import { createOffscreenExportHost, waitForAnimationFrames, waitForExportElement } from "@/lib/export/browser-export-runtime";

export class RecordPageOverflowError extends Error {
  constructor(public readonly date: string) {
    super(`${date} does not fit on one A4 page`);
    this.name = "RecordPageOverflowError";
  }
}

export async function renderFittedRecordPage(record: StoredWorkRecord, signal?: AbortSignal) {
  const host = createOffscreenExportHost();
  const root = createRoot(host);

  try {
    for (let density = 0; density < PDF_DENSITY_LEVELS; density += 1) {
      root.render(<DailyRecordPdfPage record={record} density={density} />);
      const page = await waitForExportElement<HTMLElement>(host, "[data-pdf-page]", signal);
      const content = await waitForExportElement<HTMLElement>(host, "[data-pdf-content]", signal);
      await waitForAnimationFrames(2, signal);
      const fits = content.scrollHeight <= content.clientHeight + 1
        && content.getBoundingClientRect().bottom <= page.getBoundingClientRect().bottom + 1;
      if (fits) return { page, cleanup: () => cleanupHost(root, host) };
    }
    throw new RecordPageOverflowError(record.date);
  } catch (error) {
    cleanupHost(root, host);
    throw error;
  }
}

function cleanupHost(root: Root, host: HTMLDivElement) {
  root.unmount();
  host.remove();
}
