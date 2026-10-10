Status: superseded

<!-- ADR-3 choice decides:EXP-4 source:invoice-exports/D1 -->

# ADR-3: Export links are signed URLs

<!-- ADR-3-1 rationale -->

Context: an export link must stop working after a time.

<!-- ADR-3-2 rationale -->

Decision: the link is a URL signed with a server key, and it carries its
expiry time.

<!-- ADR-3-3 rationale -->

Alternatives considered: a token stored on the server (rejected at the
time: it needs a table).
