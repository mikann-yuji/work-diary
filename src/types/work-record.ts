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
};

export const attendanceTypes: AttendanceType[] = ["present", "late", "absent", "early"];

export const attendanceLabels: Record<AttendanceType, string> = {
  present: "出勤",
  late: "遅刻",
  absent: "欠席",
  early: "早退",
};
