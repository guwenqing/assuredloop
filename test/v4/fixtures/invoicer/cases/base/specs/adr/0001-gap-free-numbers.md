Status: accepted

<!-- ADR-1 choice decides:INV-13 source:invoice-numbers/S1 -->

# ADR-1: Invoice numbers are sequential per business

<!-- ADR-1-1 rationale -->

Context: invoice numbers were free text, and two invoices of one business
could share a number.

<!-- ADR-1-2 rationale -->

Decision: each business gets one sequence, 2026-001, 2026-002 and so on.
A cancelled number stays used.

<!-- ADR-1-3 rationale -->

Alternatives considered: random numbers (rejected: tax offices ask for no
gaps); a global sequence for all businesses (rejected: it leaks how many
invoices other businesses send).
