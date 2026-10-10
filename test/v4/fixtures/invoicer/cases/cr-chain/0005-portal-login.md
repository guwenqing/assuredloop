Status: accepted

<!-- ADR-5 choice decides:EXP-9 source:portal-downloads/D1 supersedes:ADR-4 -->

# ADR-5: Exports are downloaded after a portal login

<!-- ADR-5-1 rationale -->

Context: email links (ADR-4) caused support calls when they expired or were
forwarded.

<!-- ADR-5-2 rationale -->

Decision: accountants get a portal login and download exports there. There
are no email links.

<!-- ADR-5-3 rationale -->

Alternatives considered: longer links (rejected: forwarded links stay open
longer); one-time tokens (ADR-4; rejected: they still expire in the inbox).
