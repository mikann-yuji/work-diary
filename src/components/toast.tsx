"use client";

import { useEffect } from "react";

export type ToastMessage = {
  id: number;
  message: string;
  type: "success" | "error";
};

export function Toast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[80] flex justify-center" aria-live="polite" aria-atomic="true">
      <p className={`max-w-sm rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-xl ${toast.type === "success" ? "bg-teal-800" : "bg-rose-700"}`}>
        {toast.message}
      </p>
    </div>
  );
}
