Source: standard input
Fetched: 2026-10-19T18:26Z
SHA-256: fdcfb387d2a508b393762e38f3cc5b7ea61a6ec83f3e884ef48965ace99bb45c
---
## Summary

`issue-not-sub` (0.4.0, #239) takes "the request's own item" from the `url` of an origin source. In a request whose origin sources are conversation snapshots, a source's `url` is free text, and an issue number inside it is read as the request's own item. Every task is then reported as "not a child of the request's own item", although each one is a child of the real request issue.

## Where it happens

In a spec repository that uses AssuredLoop 0.4.1, one request has six origin sources. One of them is a snapshot of a work session, recorded with `--url "<team> work session for <owner>/<repo>#46, <date>, dev rights"`. `al check --issues` then reports all five other tasks as not children of `<owner>/<repo>#46`, and names their real parent, the request issue, as "its parent". The other request has no origin source that names an issue, so the check is not made there at all.

## What we expect

- The request's own item is named explicitly, for example `issue: <URL>` at the top of the request record, written by `al new <name> --issue <URL>` or `al record <name> issue --url <URL>`.
- Without that field, `issue-not-sub` is not checked, and `al check --issues` says once that the request names no own item. An origin source's `url` is never read as the request's item.



---

Moved from the old repository on 2026-10-19. There it was number 251, opened by guwenqing on 2026-10-19. A number such as #239 in this text names an item of the old repository.

---
The owner, in the architect's tab, 2026-10-19:

- about 18:20Z: "3: can I say the dump must include the link as part of it? If so propose a format for the dump including the sha structure so their ai can fill in correctly?"
- about 18:22Z: "3: do you think if we need add a signature to the content or update time or similar so their ai can claisate in the future in case issue changes ?"
- about 18:24Z, after the architect advised to sign #3 as proposed and to keep a change warning apart as a separate issue: "Ok as you propose"
