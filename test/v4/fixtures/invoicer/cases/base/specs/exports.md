<!-- EXP-1 note -->

# Exports

<!-- EXP-2 rule serves:invoice-exports/R1 governed-by:ADR-2 -->

A user MUST be able to download the invoices of one month as one CSV file.

<!-- EXP-3 rule serves:invoice-exports/R4 -->

Every date in an export MUST be written as an ISO 8601 calendar date
(YYYY-MM-DD).

<!-- EXP-7 example illustrates:EXP-3 -->

The first lines of a monthly CSV file:

```csv
number,customer,total,paid_date
2026-001,Acme Ltd,120.00,2026-05-03
2026-002,Birch & Co,80.50,
```

<!-- EXP-8 note -->

## Export links

<!-- EXP-4 rule serves:invoice-exports/R2 governed-by:ADR-4 -->

The export link MUST expire 30 minutes after the email is sent.

<!-- EXP-5 rationale explains:EXP-4 -->

Thirty minutes is long enough to open the email, and short enough that a
forwarded link soon stops working.

<!-- EXP-6 component serves:invoice-exports/R2 governed-by:ADR-4 -->

The link service issues a one-time token for each export and stores the
time at which the token expires.
