<!-- SP-1 note -->

# Reminder emails: the change

<!-- SP-2 rule serves:R1 changes:INV-11 -->

Invoicer SHOULD send up to three reminders by email for an open invoice,
7, 14 and 21 days after the due date.

<!-- SP-3 definition serves:R1 builds-on:INV-6 -->

An open invoice is one that was sent and is not paid.

<!-- SP-4 flow serves:R1 builds-on:INV-10 -->

A daily job finds open invoices whose due date was 7, 14 or 21 days ago and
sends one reminder for each, to the billing address of INV-10.

<!-- SP-5 plan -->

One PR adds the job in invoicer-worker; the same PR replaces INV-11 and adds
the definition to `specs/invoices.md`.
