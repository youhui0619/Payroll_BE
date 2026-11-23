import { renderPayslipPdf } from './payslip-pdf';

describe('renderPayslipPdf', () => {
  it('returns a readable one-page PDF with statutory and net-pay lines', () => {
    const pdf = renderPayslipPdf({
      company: { name: 'Company (MY)' },
      employee: {
        employeeNo: 'EMP-001',
        name: 'Aida Tan',
        department: 'Operations',
        position: 'Manager',
      },
      period: '2026-01',
      payslipNumber: 'PAY-2026-01-EMP-001',
      earnings: { basicPay: 5000, grossPay: 5000 },
      deductions: { epf: 550, lindungan24Jam: 2.5, total: 700 },
      employerContributions: { epf: 650 },
      netPay: 4300,
      footerMessage: 'Prepared by Payroll',
    });
    const body = pdf.toString('ascii');
    expect(body.startsWith('%PDF-1.4')).toBe(true);
    expect(body).toContain('LINDUNG 24 Jam');
    expect(body).toContain('NET PAY');
    expect(body.endsWith('%%EOF\n')).toBe(true);
  });
});
