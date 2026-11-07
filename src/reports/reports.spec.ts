import { csvCell } from './reports.module';
describe('CSV export safety', () => {
  it('escapes quotes and embedded commas', () =>
    expect(csvCell('a,"b"')).toBe('"a,""b"""'));
  it.each(['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '  =SUM(A1)'])(
    'escapes formula-like cells %s',
    (value) => expect(csvCell(value).startsWith('"\'')).toBe(true),
  );
  it('preserves zero values', () => expect(csvCell(0)).toBe('"0"'));
});
