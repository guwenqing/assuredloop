<!-- SP-1 note -->

# The saved items name each request's own item: the change spec

<!-- SP-2 note -->

This change serves R1 in `request.md`. It changes DES-91, DES-92, DES-95
and DES-97 in `specs/design.md`, section 8. It adds paragraphs there on the
file that names each request's own item, and on the JSON Schema of the
files in the folder. The promise paragraphs come first, then the design
that keeps them.

<!-- SP-3 note -->

## The promise

<!-- SP-4 rule serves:R1 changes:DES-91 -->

**Hints from the linked work items.** A project may keep its work items in
any tracker, or in none. `al check` never contacts a tracker. With
`al check --issues <folder>`, it reads the work items that the caller saved
in that folder, in the format below. It checks only the items that the
`tasks:` of an open request name. An item's text is its body and each
comment that is not hidden. It gives a hint:
- `issue-missing`: a task names an item that is not in the folder;
- `issue-superseded`: the item's text names a superseded ADR without the
  ADR that supersedes it, by the rule of hints-and-blocks R5 (schema.md 5):
  in the same marker for a link, in the same paragraph for a word;
- `issue-bare-ref`: the item's text holds a bare `#n`, and the item is in a
  repository other than the request's own;
- `issue-not-sub`: the item is not a child of the request's own item, where
  the folder names the request's own item and the item says which item is
  its parent;
- `phrase`: a phrase or pattern of the config matches the item's text
  ("Phrases for the review", section 3).

<!-- SP-5 rule serves:R1 changes:DES-92 -->

Each of these is a hint in every mode; none is `not ok`. Without
`--issues`, `al check` reads no item and gives no line about items.
Archived requests are history, and their tasks are not read. Reading items
is optional: a project needs no tracker, and every other check works the
same without one. `al check` takes a request's own item only from the file
in the folder that names it, never from an origin source or another record.
When the folder names no own item for a request, `al check` does not make
the `issue-not-sub` check for that request's items, and its `Not known`
line says so once for that request.

<!-- SP-6 note -->

## The request's own item

<!-- SP-7 data serves:R1 changes:DES-95 builds-on:SP-5 -->

**The request's own item** is the item that the file
`assuredloop-requests.json` in the folder names for the request: the value
of the request's name under `requests`. The value names an item in one of
the forms above, as a task's `ref` does. When the value names no item in
those forms, the item in the folder whose `ref` the value holds as a whole
word is the own item; when there is none, the value itself is the own
item's `ref`. An item is a child of the own item when its `parent` names
the own item: by the parent's `url`, its `ref`, or its `number` in the
item's repository. The parent's `url` names the own item when it equals the
`url` of the own item or the value. It also names the own item when it
holds the own item's `ref` as a whole word, or names the own item in a form
above. When the file names no own item for a request, or the value is a
`#n` and the request's own repository is not known, `issue-not-sub` is not
given for that request's items, and the `Not known` line says why, once for
that request. An origin source's `url` does not name the own item. The own
item itself gets no `issue-not-sub`. An item with no `parent` field says
nothing about its parent: it gets no `issue-not-sub`, and the `Not known`
line says so. `parent: null` means that the item has no parent.

<!-- SP-8 interface serves:R1 builds-on:SP-5 -->

**The file of own items.** `assuredloop-requests.json` is a JSON object
with two fields, and no other field:
- `format`: the exact text `assuredloop-items/1`;
- `requests`: an object. Each key is the name of a request, and its value is
  that request's own item, as a text that is not empty: a URL, an
  `owner/repo#n`, or another tracker's key, for example `PROJ-1`.

<!-- SP-9 interface serves:R1 builds-on:SP-5 -->

The file is optional. It is not an item, and it is not read as one. A file
that is not valid JSON, has another `format`, has another field, or has a
value of another type gets `issue-unread` at the file, and is ignored as a
whole: no request has an own item then, and `al check` goes on. A key
that names no open request is ignored.

<!-- SP-10 interface serves:R1 changes:DES-97 builds-on:SP-5 -->

**The folder.** `al check --issues <folder>` reads each `*.json` file in
the folder, but not its subfolders, and not `assuredloop-requests.json`. A
file holds one item, or a list of items, as `gh issue view` and
`gh issue list` print them. A file that is not valid JSON gets
`issue-unread` at the file. In a list, each entry that is not an item gets
`issue-unread` at the file, and the other entries are read. The `Not known`
line names each such file. The folder is a path from the current
directory. A folder that is not there stops `al check` with a refusal: exit
2, and a line that names it.

<!-- SP-11 interface serves:R1 builds-on:SP-5 -->

**The JSON Schema of the files.** The README gives a JSON Schema (draft
2020-12) for each of the two kinds of file, so that a person or an AI can
write them and check them. The schema of an item file, which says what
"The format of an item" says:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "an item file: one item, or a list of items",
  "oneOf": [
    {"$ref": "#/$defs/item"},
    {"type": "array", "items": {"$ref": "#/$defs/item"}}
  ],
  "$defs": {
    "item": {
      "type": "object",
      "required": ["body"],
      "anyOf": [
        {"required": ["url"], "properties": {"url": {"type": "string", "pattern": "^https?://[^/\\s]+/[^/\\s]+/[^/\\s]+/issues/[0-9]+"}}},
        {"required": ["number", "repository"]},
        {"required": ["ref"]}
      ],
      "properties": {
        "body": {"type": "string"},
        "url": {"type": "string"},
        "number": {"type": "integer"},
        "comments": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["body"],
            "properties": {"body": {"type": "string"}, "isMinimized": {"type": "boolean"}}
          }
        },
        "parent": {
          "oneOf": [
            {"type": "null"},
            {
              "type": "object",
              "properties": {"url": {"type": "string"}, "number": {"type": "integer"}, "ref": {"type": "string", "minLength": 1}}
            }
          ]
        },
        "ref": {"type": "string", "minLength": 1},
        "repository": {"type": "string", "minLength": 1}
      }
    }
  }
}
```

<!-- SP-12 interface serves:R1 builds-on:SP-5 -->

The schema of `assuredloop-requests.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "assuredloop-requests.json",
  "type": "object",
  "required": ["format", "requests"],
  "additionalProperties": false,
  "properties": {
    "format": {"const": "assuredloop-items/1"},
    "requests": {
      "type": "object",
      "additionalProperties": {"type": "string", "minLength": 1}
    }
  }
}
```

<!-- SP-13 example illustrates:SP-8 -->

An `assuredloop-requests.json` for two requests, one with a GitHub issue
and one with an item of another tracker:

```json
{
  "format": "assuredloop-items/1",
  "requests": {
    "invoice-exports": "https://github.com/acme/invoicer/issues/30",
    "pay-run": "PROJ-1"
  }
}
```

<!-- SP-14 rationale explains:SP-7 -->

Why a file in the folder: an origin source's `url` is free text, for
example "a work session for acme/invoicer#46". An issue number in it was
read as the request's own item, so each task was reported as not a child
of it (issue #3). Only the caller knows which item is the request's own,
and the caller already prepares the folder. So the folder names it, in one
file, and `al` guesses nothing. The item files stay as `gh` prints them.

<!-- SP-15 note -->

## Migration

<!-- SP-16 migration -->

A project that relied on an origin source's `url` for the own item gets no
`issue-not-sub` after this change, and a `Not known` line for each request.
To keep the check, it writes `assuredloop-requests.json` in the folder,
with each request's own item.
