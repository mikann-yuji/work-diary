import type {
  FutureMeasure,
  FutureMeasureExecution,
  TodayMedicationMeasure,
  TodayMeasures,
} from "@/types/work-record";

export const futureMeasureExecutionOptions: Array<{
  id: Exclude<FutureMeasureExecution, null>;
  label: string;
}> = [
  { id: "done", label: "○" },
  { id: "partial", label: "△" },
  { id: "notDone", label: "×" },
];

export const futureMeasureExecutionLabels: Record<
  Exclude<FutureMeasureExecution, null>,
  string
> = {
  done: "○",
  partial: "△",
  notDone: "×",
};

export function createEmptyTodayMeasures(): TodayMeasures {
  return {
    medications: [emptyMedicationMeasure(), emptyMedicationMeasure(), emptyMedicationMeasure()],
    others: ["", ""],
  };
}

export function createEmptyFutureMeasures(): [
  FutureMeasure,
  FutureMeasure,
  FutureMeasure,
  FutureMeasure,
  FutureMeasure,
] {
  return [emptyFutureMeasure(), emptyFutureMeasure(), emptyFutureMeasure(), emptyFutureMeasure(), emptyFutureMeasure()];
}

function emptyMedicationMeasure(): TodayMedicationMeasure {
  return { detail: "", time: "" };
}

function emptyFutureMeasure(): FutureMeasure {
  return { action: "", execution: null, result: "" };
}
