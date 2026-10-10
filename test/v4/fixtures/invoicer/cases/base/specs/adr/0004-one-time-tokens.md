Status: accepted

<!-- ADR-4 choice decides:EXP-4,EXP-6 source:invoice-exports/D2 supersedes:ADR-3 -->

# ADR-4: Export links use one-time tokens stored on the server

<!-- ADR-4-1 rationale -->

Context: a signed URL (ADR-3) cannot be cancelled early, and a forwarded
link works until it expires.

<!-- ADR-4-2 rationale -->

Decision: each export link carries a random one-time token. The link
service stores the token and the time at which it expires.

<!-- ADR-4-3 rationale -->

Alternatives considered: signed URLs (ADR-3; rejected: they cannot be
cancelled); a session login before each download (rejected: customers'
accountants have no login).
