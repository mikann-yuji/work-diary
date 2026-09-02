import type { AttendanceType } from "@/types/work-record";

function toMinutes(time: string) {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function calculateLostMinutes(
  type: AttendanceType,
  scheduledStart: string,
  scheduledEnd: string,
  actualStart: string,
  actualEnd: string,
) {
  const plannedStart = toMinutes(scheduledStart);
  const plannedEnd = toMinutes(scheduledEnd);
  if (plannedStart === null || plannedEnd === null || plannedEnd <= plannedStart) return 0;

  if (type === "present") return 0;
  if (type === "absent") return plannedEnd - plannedStart;
  if (type === "late") {
    const actual = toMinutes(actualStart);
    return actual === null ? 0 : Math.max(0, Math.min(actual, plannedEnd) - plannedStart);
  }

  const actual = toMinutes(actualEnd);
  return actual === null ? 0 : Math.max(0, plannedEnd - Math.max(actual, plannedStart));
}

export function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
