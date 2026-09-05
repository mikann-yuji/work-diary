import type { AttendanceType, WorkRecord } from "@/types/work-record";

export type CalendarMonth = { year: number; month: number };

export type MonthlySummaryData = {
  recordCount: number;
  attendanceCounts: Record<AttendanceType, number>;
  lostMinutes: number;
};

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentMonth(date = new Date()): CalendarMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function shiftMonth(value: CalendarMonth, amount: number): CalendarMonth {
  const firstDay = new Date(value.year, value.month - 1 + amount, 1);
  return { year: firstDay.getFullYear(), month: firstDay.getMonth() + 1 };
}

export function getMonthKey(value: CalendarMonth) {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

export function createCalendarDays(value: CalendarMonth): Array<string | null> {
  const firstDay = new Date(value.year, value.month - 1, 1);
  const daysInMonth = new Date(value.year, value.month, 0).getDate();
  const days: Array<string | null> = Array(firstDay.getDay()).fill(null);
  const month = String(value.month).padStart(2, "0");

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(`${value.year}-${month}-${String(day).padStart(2, "0")}`);
  }

  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export function summarizeMonth(
  records: Iterable<WorkRecord>,
  value: CalendarMonth,
): MonthlySummaryData {
  const monthKey = `${getMonthKey(value)}-`;
  const attendanceCounts: Record<AttendanceType, number> = {
    present: 0,
    late: 0,
    early: 0,
    absent: 0,
    holiday: 0,
    plannedHoliday: 0,
  };
  let recordCount = 0;
  let lostMinutes = 0;

  for (const record of records) {
    if (!record.date.startsWith(monthKey)) continue;
    recordCount += 1;
    attendanceCounts[record.type] += 1;
    lostMinutes += record.lostMinutes;
  }

  return { recordCount, attendanceCounts, lostMinutes };
}
