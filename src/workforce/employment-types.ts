export const EMPLOYMENT_TYPE_VALUES = [
  'PERMANENT',
  'CONTRACT',
  'PART-TIME',
  'INTERN',
  'TEMPORARY',
  'TRAINEE',
  'FREELANCE',
  'CASUAL',
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPE_VALUES)[number];

export const EMPLOYMENT_TYPES = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'PART-TIME', label: 'Part-time' },
  { value: 'INTERN', label: 'Intern' },
  { value: 'TEMPORARY', label: 'Temporary' },
  { value: 'TRAINEE', label: 'Trainee' },
  { value: 'FREELANCE', label: 'Freelance' },
  { value: 'CASUAL', label: 'Casual / Daily Worker' },
] as const;
