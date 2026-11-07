# Statutory source artifacts

Retrieved/reviewed on 2026-10-30. The catalog builder hashes original PDFs where available and explicitly labels extracted-data hashes otherwise. No seed automatically activates these rules.

- `epf-2025-10-extracted.json`: web-reader extraction of the official KWSP Third Schedule, Parts A/C/E. Direct PDF download was blocked; checksum identifies this JSON, not the unavailable original PDF. Source lines/pages are retained.
- `epf-2025-10-rate-evidence.json`: numeric formulas and worked examples from KWSP's mandatory-contribution guidance, retrieved 2026-10-31. This supplies the A/C/E above-table branch and Part F. The combined raw sum is rounded up, while the unallocated difference is preserved separately. Primary table and supporting evidence checksums remain distinct.
- `eis-2024-10.pdf` and its extracted JSON: official Act 800 table, visually transcribed and checked; above-ceiling row is represented by the RM6,000 ceiling.
- `perkeso-combined-2026-06.pdf`: PERKESO combined contribution FAQ, Appendix 1 (PDF pages 4–11). `scripts/extract-perkeso.py` extracts all 65 rows with page numbers and validates both printed totals. The catalog separates SOCSO employee/employer shares from LINDUNG, and represents the duplicate above-ceiling row by a ceiling. The PDF supplies the effective June 2026 date.
- `perkeso-circular-02-2026.pdf`: supplementary original circular. Page 4 makes phase implementation dates subject to PERKESO determination. Its original mandatory-participation text predates the July 2026 change for local employees; do not use it as current participation guidance. The current [PERKESO scheme page](https://perkeso.gov.my/perkhidmatan-kami/perlindungan/lindung-24-jam.html) describes voluntary local participation and mandatory foreign-worker participation. Historical participation resolution remains pending.
- `pcb-specification-2026.pdf` and extracted text: original LHDN formula specification, relief descriptions and worked examples. The preview checksum identifies the original PDF. The publication's worked examples retain 2025 month labels; tests explicitly record this. Passing examples does not constitute LHDN approval.

The LINDUNG catalog entry ends on 2026-12-31 as a verification cutoff, not as an assertion of legal expiry. Later phase dates/schedules must be confirmed and imported for subsequent coverage. SOCSO entries derived from the combined PDF start in June 2026; historical schedules before that date remain to be imported.

PDF renderings and extraction scratch files belong in ignored `tmp/pdfs`, not the source archive. Rebuild the catalog with `npm run statutory:catalog`; this command does not connect to the database.
