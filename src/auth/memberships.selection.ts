export const membershipSelection = {
  id: true,
  companyId: true,
  userId: true,
  employeeId: true,
  roles: true,
  active: true,
  user: { select: { email: true, fullName: true } },
} as const;
