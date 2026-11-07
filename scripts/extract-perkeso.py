"""Extract published amounts, never approximate contribution tables with rates."""
from pathlib import Path
from decimal import Decimal
import json
import re
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
source = root / 'statutory/sources/perkeso-combined-2026-06.pdf'
rows = []
for page_number, page in enumerate(PdfReader(source).pages, 1):
    if page_number < 4:
        continue
    text = page.extract_text()
    for match in re.finditer(r'(?m)^\s*(\d+)\.\s+(.*?)(?=^\s*\d+\.\s+|\Z)', text, re.S | re.M):
        index, body = int(match[1]), match[2]
        amounts = re.findall(r'RM\s*([\d,]+(?:\.\d{2})?)', body)
        wages, contributions = amounts[:-7], amounts[-7:]
        if len(contributions) != 7 or not wages:
            raise ValueError(f'Invalid source row {index}')
        values = [Decimal(v.replace(',', '')) for v in contributions]
        er1, ee1, lindung1, total1, er2, lindung2, total2 = values
        assert lindung1 == lindung2
        assert er1 + ee1 + lindung1 == total1
        assert er2 + lindung2 == total2
        lower = Decimal(wages[0].replace(',', '')) if index > 1 else Decimal(0)
        upper = Decimal(wages[-1].replace(',', '')) if index < 65 else None
        rows.append(dict(index=index, page=page_number, lower=f'{lower:.2f}', upper=f'{upper:.2f}' if upper else None,
                         employer1=f'{er1:.2f}', employee1=f'{ee1:.2f}', lindung=f'{lindung1:.2f}', employer2=f'{er2:.2f}', total1=f'{total1:.2f}', total2=f'{total2:.2f}'))
assert [r['index'] for r in rows] == list(range(1, 66))
assert rows[0]['lower'] == '0.00'
for prev, row in zip(rows, rows[1:]):
    assert prev['upper'] == row['lower']
assert rows[-1]['lower'] == '6000.00' and rows[-1]['upper'] is None
for field in ['employer1', 'employee1', 'lindung', 'employer2', 'total1', 'total2']:
    assert rows[-1][field] == rows[-2][field]
result = dict(sourceUrl='https://www.perkeso.gov.my/images/lindung/lindung-24-jam/SoalanLazimFormatTeksFail_BM.pdf',
              retrievedDate='2026-10-30', extraction='pypdf text extraction of Appendix 1, original PDF pages 4–11. Printed column totals and both LINDUNG columns checked for every row.', rows=rows)
(root / 'statutory/sources/perkeso-2026-06-extracted.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Extracted {len(rows)} source rows; column totals and continuity verified.')
