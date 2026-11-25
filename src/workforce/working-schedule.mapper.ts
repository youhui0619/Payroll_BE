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

export function toWorkingScheduleMap<
  T extends { employmentType?: string | null; scheduleDays?: unknown | null },
>(data: T[]) {
  return data.reduce<Record<string, unknown | null>>((result, schedule) => {
    if (schedule.employmentType && !(schedule.employmentType in result)) {
      result[schedule.employmentType] = normalizeWorkingSchedule(
        schedule.scheduleDays,
      );
    }
    return result;
  }, {});
}
