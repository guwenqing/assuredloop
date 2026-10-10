Status: accepted

<!-- ADR-5 choice decides:EXP-2 source:invoice-exports/S1 supersedes:ADR-9 -->

# ADR-5: Exports are CSV files with a byte order mark

<!-- ADR-5-1 rationale -->

Context: one accounting tool reads UTF-8 only when the file starts with a
byte order mark.

<!-- ADR-5-2 rationale -->

Decision: monthly exports are CSV, UTF-8 with a byte order mark, comma
separated, with a header row.
