export type AttendanceType = "present" | "late" | "absent" | "early";

export type CauseCategoryId =
  | "sleep"
  | "disability_traits"
  | "physical_condition"
  | "workload"
  | "lifestyle";

export type CauseOptionId = string;

export type CauseCategorySelection = {
  selectedOptionIds: CauseOptionId[];
  otherText: string;
};

export type CauseSelections = Record<CauseCategoryId, CauseCategorySelection>;

export type MedicationStatus = "taken" | "not_taken" | null;
export type MedicationPeriod = "morning" | "noon" | "evening" | "night";

export type MedicationEntry = {
  status: MedicationStatus;
  note: string;
};

export type Medication = Record<MedicationPeriod, MedicationEntry>;

export type SleepDepth = "shallow" | "normal" | "deep" | null;

export type PreviousDayState = {
  sleepHours: number | null;
  awakenings: number | null;
  sleepDepth: SleepDepth;
  fatigueAfterReturningHome: number | null;
  wentOut: boolean | null;
  outingLoad: number | null;
};

export type WakingState = {
  sleepiness: number | null;
  conditionNote: string;
};

export type WorkRecord = {
  id: string;
  date: string;
  type: AttendanceType;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  lostMinutes: number;
  causes: CauseSelections;
  medication: Medication;
  previousDay: PreviousDayState;
  waking: WakingState;
};

export const attendanceTypes: AttendanceType[] = ["present", "late", "absent", "early"];

export const attendanceLabels: Record<AttendanceType, string> = {
  present: "出勤",
  late: "遅刻",
  absent: "欠勤",
  early: "早退",
};
