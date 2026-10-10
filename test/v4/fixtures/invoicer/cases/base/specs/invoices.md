<!-- INV-1 note -->

# Invoices

<!-- INV-2 purpose serves:invoicer-baseline/R1 -->

Invoicer sends correct invoices to small businesses and keeps a record of
each one.

<!-- INV-3 scope serves:invoicer-baseline/R1 -->

Invoicer covers one-off and monthly invoices in one one currency.

<!-- INV-4 limit serves:invoicer-baseline/R1 -->

Invoicer does not calculate tax.

<!-- INV-5 note -->

## Terms

<!-- INV-6 definition serves:invoicer-baseline/R1 -->

A paid invoice is one whose full amount has arrived.

<!-- INV-7 note -->

## Invoice data

<!-- INV-8 data serves:invoicer-baseline/R1 -->

An invoice has a number, a customer, lines, a total and a paid date.

<!-- INV-13 rule serves:invoice-numbers/R1 governed-by:ADR-1 -->

Invoice numbers MUST be unique within one business and MUST NOT be used
again, even after an invoice is cancelled.

<!-- INV-15 rationale explains:INV-13 -->

Tax offices in several countries ask for numbers with no gaps and no
repeats, so a cancelled number stays used.

<!-- INV-16 example illustrates:INV-13 -->

Business A sends 2026-001 and 2026-002, then cancels 2026-002. Its next
invoice is 2026-003, not 2026-002.

<!-- INV-9 note -->

## Sending

<!-- INV-10 rule serves:invoicer-baseline/R1 -->

Invoicer MUST send each invoice by email to the customer's billing address.

<!-- INV-11 rule serves:invoicer-baseline/R1 -->

Invoicer SHOULD send a reminder 7 days after the due date of an open
invoice.

<!-- INV-12 open resolved-by:reminder-emails/D1 -->

Whether reminders may also go by text message is open.
