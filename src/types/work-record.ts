export type AttendanceType = "late" | "absent" | "early";

export type WorkRecord = {
  id: string;
  date: string;
  type: AttendanceType;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  lostMinutes: number;
};

export const attendanceLabels: Record<AttendanceType, string> = {
  late: "遅刻",
  absent: "欠席",
  early: "早退",
};
