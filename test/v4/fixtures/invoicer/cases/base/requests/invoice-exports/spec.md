<!-- SP-1 note -->

# Invoice exports: the change

<!-- SP-2 note -->

This change adds monthly CSV exports, an email link that expires, and a
yearly ZIP. Part 1 (CSV and links) is consolidated. Part 2 (the ZIP) is
open.

<!-- SP-3 note -->

## Promises

<!-- SP-4 rule serves:R1 -->

A user MUST be able to download the invoices of one month as one CSV file.

<!-- SP-5 rule serves:R4 -->

Every date in an export MUST be written as an ISO 8601 calendar date
(YYYY-MM-DD).

<!-- SP-6 rule serves:R2 -->

The export link MUST expire 30 minutes after the email is sent.

<!-- SP-7 rule serves:R3 builds-on:EXP-2 -->

A user MUST be able to download the invoices of one year as one ZIP file.

<!-- SP-8 note -->

## Design

<!-- SP-9 component serves:R2 -->

The link service issues a one-time token for each export and stores the
time at which the token expires.

<!-- SP-10 data serves:R3 builds-on:EXP-3 -->

A yearly ZIP holds twelve monthly CSV files named YYYY-MM.csv, each in the
format of a monthly export.

<!-- SP-11 interface serves:R3 -->

The worker serves `GET /exports/{year}.zip` and answers 404 for a year with
no invoices.

<!-- SP-12 rationale explains:SP-10 -->

Twelve monthly files let an accountant check one month without opening the
rest.

<!-- SP-13 note -->

## Plan

<!-- SP-14 plan for:T1 -->

Part 1: SP-4, SP-5, SP-6 and SP-9 go into `specs/exports.md` with the CSV
code in invoicer-web.

<!-- SP-15 plan for:T2 -->

Part 2: SP-7, SP-10 and SP-11 go into `specs/exports.md` with the ZIP code
in invoicer-worker.
