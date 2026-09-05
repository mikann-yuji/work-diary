"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { putDraft, type DraftEntry } from "@/lib/drafts/indexed-db";

export type DraftSaveState = "clean" | "changed" | "saving" | "saved" | "error";

export function useDraftAutosave<T>({ draft, enabled }: { draft: DraftEntry<T>; enabled: boolean }) {
  const [state, setState] = useState<DraftSaveState>("clean");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const latestRef = useRef(draft);
  const signatureRef = useRef("");
  const lastSavedSignatureRef = useRef("");
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWriteRef = useRef(0);
  const readyKeyRef = useRef<string | null>(null);
  useEffect(() => { latestRef.current = draft; }, [draft]);

  const saveLatest = useCallback(async () => {
    if (!enabled || savingRef.current) { queuedRef.current = true; return; }
    savingRef.current = true;
    try {
      do {
        queuedRef.current = false;
        const current = latestRef.current;
        const signature = JSON.stringify(current.payload);
        if (signature === lastSavedSignatureRef.current) break;
        setState("saving");
        const updatedAt = Date.now();
        await putDraft({ ...current, updatedAt });
        lastSavedSignatureRef.current = signature;
        lastWriteRef.current = updatedAt;
        setSavedAt(updatedAt);
        setState("saved");
      } while (queuedRef.current || JSON.stringify(latestRef.current.payload) !== lastSavedSignatureRef.current);
    } catch {
      setState("error");
    } finally {
      savingRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    const signature = JSON.stringify(draft.payload);
    signatureRef.current = signature;
    if (!enabled) return;
    if (readyKeyRef.current !== draft.key) {
      readyKeyRef.current = draft.key;
      lastSavedSignatureRef.current = signature;
      setState("clean");
      setSavedAt(null);
      return;
    }
    if (signature === lastSavedSignatureRef.current) return;
    setState("changed");
    if (timerRef.current) clearTimeout(timerRef.current);
    const wait = Math.max(0, 5000 - (Date.now() - lastWriteRef.current));
    timerRef.current = setTimeout(() => void saveLatest(), wait);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [draft.key, draft.payload, enabled, saveLatest]);

  useEffect(() => {
    const flush = () => { if (enabled && JSON.stringify(latestRef.current.payload) !== lastSavedSignatureRef.current) void saveLatest(); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", flush); };
  }, [enabled, saveLatest]);

  useEffect(() => () => { if (enabled) void saveLatest(); }, [enabled, saveLatest]);

  const markClean = useCallback((signature?: string) => {
    lastSavedSignatureRef.current = signature ?? JSON.stringify(latestRef.current.payload);
    setState("clean");
    setSavedAt(null);
  }, []);

  return { state, savedAt, flush: saveLatest, markClean };
}
