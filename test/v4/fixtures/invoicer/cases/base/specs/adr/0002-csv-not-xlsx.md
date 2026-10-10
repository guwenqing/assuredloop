Status: accepted

<!-- ADR-2 choice decides:EXP-2 source:invoice-exports/S1 -->

# ADR-2: Exports are CSV files, not spreadsheets

<!-- ADR-2-1 rationale -->

Context: the owner asked for files that "any accounting tool can read".

<!-- ADR-2-2 rationale -->

Decision: monthly exports are CSV, UTF-8, comma separated, with a header
row.

<!-- ADR-2-3 rationale -->

Alternatives considered: XLSX (rejected: needs a library and is not plain
text); JSON (rejected: accounting tools do not import it).
