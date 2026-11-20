export function normalizeWorkingSchedule(value: unknown): unknown | null {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? { days: value } : value;
}

export function toWorkingScheduleResponse<
  T extends { scheduleDays?: unknown | null },
>(data: T) {
  const { scheduleDays, ...rest } = data;
  return {
    ...rest,
    workingSchedule: normalizeWorkingSchedule(scheduleDays),
  };
}
