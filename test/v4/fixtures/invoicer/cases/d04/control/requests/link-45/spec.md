<!-- SP-1 note -->

# Link time 45 minutes: the change

<!-- SP-2 rule serves:R1 changes:EXP-4 -->

The export link MUST expire 45 minutes after the email is sent, and the
expired page MUST offer to send a new link to the same email address.

<!-- SP-3 rationale explains:SP-2 changes:EXP-5 -->

Forty-five minutes is long enough to open the email after a meeting, and
short enough that a forwarded link soon stops working.

<!-- SP-4 plan -->

A later PR, after link-refresh (#72) merges: the link time in invoicer-web
(config/link.json and its test) and in invoicer-mobile, EXP-4 and EXP-5
replaced, and docs/exports.md changed to 45 minutes. SP-2 keeps the new
link of link-refresh/SP-2.
