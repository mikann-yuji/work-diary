import type {
  Medication,
  MedicationPeriod,
  PreviousDayState,
  SleepDepth,
  WakingState,
} from "@/types/work-record";

export const medicationPeriods: { id: MedicationPeriod; label: string }[] = [
  { id: "morning", label: "朝" },
  { id: "noon", label: "昼" },
  { id: "evening", label: "夕" },
  { id: "night", label: "夜" },
];

export const sleepDepthOptions: { id: Exclude<SleepDepth, null>; label: string }[] = [
  { id: "shallow", label: "浅い" },
  { id: "normal", label: "普通" },
  { id: "deep", label: "深い" },
];

export const sleepDepthLabels: Record<Exclude<SleepDepth, null>, string> = {
  shallow: "浅い",
  normal: "普通",
  deep: "深い",
};

export function createEmptyMedication(): Medication {
  return {
    morning: { status: null, note: "" },
    noon: { status: null, note: "" },
    evening: { status: null, note: "" },
    night: { status: null, note: "" },
  };
}

export function createEmptyPreviousDayState(): PreviousDayState {
  return {
    sleepHours: null,
    awakenings: null,
    sleepDepth: null,
    fatigueAfterReturningHome: null,
    wentOut: null,
    outingLoad: null,
  };
}

export function createEmptyWakingState(): WakingState {
  return { sleepiness: null, conditionNote: "" };
}
