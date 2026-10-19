Status: accepted

<!-- ADR-6 choice decides:EXP-3 source:invoice-exports/S1 supersedes:ADR-8 -->

# ADR-6: Dates in exports are ISO 8601 dates

<!-- ADR-6-1 rationale source:invoice-exports/S1, -->

Context: accountants read the dates of exports in many countries.

<!-- ADR-6-2 rationale decides:,EXP-3 -->

Decision: every date in an export is written as YYYY-MM-DD.

<!-- ADR-6-3 rationale decides:EXP-2,,EXP-3 -->

Scope: the CSV exports and the yearly ZIP use the same date format.

<!-- ADR-6-4 rationale source: -->

Alternatives considered: the date format of the business's country
(rejected: it differs between customers and their accountants).

<!-- ADR-6-5 rationale example -->

Example: the 4th of May 2026 is written as 2026-05-04.

<!-- ADR-6-6 rationale -->

Consequence: no export depends on the language of the user.
