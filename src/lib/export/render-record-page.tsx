"use client";

import { createRoot, type Root } from "react-dom/client";
import { DailyRecordPdfPage, PDF_DENSITY_LEVELS } from "@/components/daily-record-pdf-page";
import type { StoredWorkRecord } from "@/lib/firestore/records";

export class RecordPageOverflowError extends Error {
  constructor(public readonly date: string) {
    super(`${date} does not fit on one A4 page`);
    this.name = "RecordPageOverflowError";
  }
}

export async function renderFittedRecordPage(record: StoredWorkRecord) {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "297mm",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    for (let density = 0; density < PDF_DENSITY_LEVELS; density += 1) {
      root.render(<DailyRecordPdfPage record={record} density={density} />);
      await afterRender();
      const page = host.querySelector<HTMLElement>("[data-pdf-page]");
      const content = host.querySelector<HTMLElement>("[data-pdf-content]");
      if (!page || !content) throw new Error("Record page was not rendered");
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

function afterRender() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
