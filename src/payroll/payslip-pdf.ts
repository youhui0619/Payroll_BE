type PayslipDocument = {
  company?: { name?: string | null } | null;
  employee?: {
    employeeNo?: string | null;
    name?: string | null;
    department?: string | null;
    position?: string | null;
    bank?: string | null;
    bankAccount?: string | null;
  } | null;
  period?: string | null;
  payslipNumber?: string | null;
  earnings?: Record<string, unknown> | null;
  deductions?: Record<string, unknown> | null;
  employerContributions?: Record<string, unknown> | null;
  netPay?: unknown;
  footerMessage?: string | null;
};

const text = (value: unknown) =>
  String(value ?? '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const money = (value: unknown) => `RM ${Number(value ?? 0).toFixed(2)}`;

const value = (
  section: Record<string, unknown> | null | undefined,
  key: string,
) => section?.[key] ?? 0;

const wrap = (line: string, max = 86) => {
  const result: string[] = [];
  for (let index = 0; index < line.length; index += max)
    result.push(line.slice(index, index + max));
  return result.length ? result : [''];
};

export function renderPayslipPdf(document: PayslipDocument) {
  const earnings = document.earnings;
  const deductions = document.deductions;
  const employer = document.employerContributions;
  const employee = document.employee;
  const lines = [
    document.company?.name || 'Payroll company',
    'SALARY ADVICE',
    `Period: ${document.period || '-'}    Payslip: ${document.payslipNumber || '-'}`,
    `Employee: ${employee?.name || '-'} (${employee?.employeeNo || '-'})`,
    `Department: ${employee?.department || '-'}    Position: ${employee?.position || '-'}`,
    '',
    'EARNINGS',
    `Basic salary: ${money(value(earnings, 'basicPay'))}`,
    `Unpaid leave: ${money(value(earnings, 'unpaidLeave'))}`,
    `Overtime: ${money(value(earnings, 'overtime'))}`,
    `Allowance: ${money(value(earnings, 'allowance'))}`,
    `Bonus: ${money(value(earnings, 'bonus'))}`,
    `Commission: ${money(value(earnings, 'commissions'))}`,
    `Gross pay: ${money(value(earnings, 'grossPay'))}`,
    '',
    'EMPLOYEE DEDUCTIONS',
    `EPF: ${money(value(deductions, 'epf'))}`,
    `SOCSO: ${money(value(deductions, 'socso'))}`,
    `LINDUNG 24 Jam: ${money(value(deductions, 'lindungan24Jam'))}`,
    `EIS: ${money(value(deductions, 'eis'))}`,
    `PCB: ${money(value(deductions, 'pcb'))}`,
    `Advance: ${money(value(deductions, 'advance'))}`,
    `Other: ${money(value(deductions, 'other'))}`,
    `Total deductions: ${money(value(deductions, 'total'))}`,
    '',
    'EMPLOYER CONTRIBUTIONS',
    `EPF: ${money(value(employer, 'epf'))}`,
    `SOCSO: ${money(value(employer, 'socso'))}`,
    `EIS: ${money(value(employer, 'eis'))}`,
    '',
    `NET PAY: ${money(document.netPay)}`,
    ...(employee?.bank || employee?.bankAccount
      ? [
          `Payment account: ${employee.bank || '-'} ${employee.bankAccount || '-'}`,
        ]
      : []),
    ...(document.footerMessage ? ['', document.footerMessage] : []),
  ].flatMap((line) => wrap(line));

  const stream = [
    'BT',
    '/F1 10 Tf',
    '50 790 Td',
    ...lines.map((line, index) =>
      index === 0 ? `(${text(line)}) Tj` : `0 -16 Td (${text(line)}) Tj`,
    ),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n');
  pdf += `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}
