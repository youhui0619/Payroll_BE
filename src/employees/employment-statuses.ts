export const EMPLOYMENT_STATUS_VALUES = [
  'ACTIVE',
  'PROBATION',
  'SUSPENDED',
  'RESIGNED',
  'TERMINATED',
  'RETIRED',
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUS_VALUES)[number];
