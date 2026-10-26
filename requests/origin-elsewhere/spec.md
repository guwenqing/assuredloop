<!-- OE-1 note -->

# Original files outside the repo: the change spec

<!-- OE-2 note -->

This change serves R1 in `request.md`. A project may keep the original files
of its requests outside the repo: the owner's words, the sign-off snapshots
and the other source snapshots. The repo keeps each file's name and the
SHA-256 of its text, as today, so that a requirement and a sign-off still
bind to their exact text. A project with no new setting works as before.

<!-- OE-3 note -->

## 1. Where the files are

<!-- OE-4 data serves:R1 builds-on:OE-8 -->

The committed config says that the project keeps its original files outside,
by a name, not by a path: `originals: {outside: <name>}` in
`.assuredloop/config.yaml`. With no `originals` key, the files are in the
repo, as today, and `al` reads no other setting for them.

<!-- OE-5 data serves:R1 builds-on:OE-8 -->

Each worker maps the name to a folder on its own machine, in
`assuredloop/places.yaml` in the user's config folder (`$XDG_CONFIG_HOME`,
else `~/.config`): one line for each name, `<name>: <folder>`. The folder is
an absolute path of an existing folder. Every clone on the machine finds the
same folder, with no setup in the clone. In the folder, the files keep the
layout of the repo: `<folder>/<request>/<file>`, with the same file names as
in `origin/`. A worker with several projects has one line for each.

<!-- OE-6 choice serves:R1 builds-on:OE-8,OE-9 -->

No places file, or no line for the name, means that no place is set. A
places file that cannot be read or is not valid YAML, and a line that is
empty, relative or names no existing folder, make the command refuse with
the reason. Such a setting does not count as "no place set", so a broken
setting cannot pass a strict check. The commands that read the working
tree's records (`al check`, `al conclude`, `al context`) and the three
writers read the places file. `al export` does not read it.

<!-- OE-18 rationale -->

Considered and not taken: one environment variable (each shell and each
session launch must set it); a git-ignored file in each clone (each new
clone needs it).

<!-- OE-7 note -->

## 2. Reading: one result for each file

<!-- OE-8 rule serves:R1 changes:DES-90 -->

One reader gives each original file that a record names one result, and
every reader of original files uses it: the record checks
(`record-evidence`), the sign-off state, `unsigned-requirement`,
`signoff-coverage`, `al context` and `al conclude`. The result is one of
three:

- verified: the text after the separator has the recorded SHA-256;
- not checked: the project keeps its files outside, the file is not in the
  repo, and no place is set;
- failed, with the reason: missing, unreadable, a folder or a link where a
  file should be, no separator, or a different SHA-256.

<!-- OE-19 rule serves:R1 changes:DES-90 -->

The repo copy is read first: `requests/<request>/origin/<file>`, or at a
commit, that commit's file. Only a file that does not exist there goes on to
the place. A repo copy that exists but cannot be read, or that is a folder,
is failed and says so, even when the place holds a good copy. A link at
`<folder>/<request>` or at the file is failed. A failed file is
`not ok record-evidence`, as today. Its message names it as
`originals:<request>/<file>`, never by the folder's path.

<!-- OE-9 rule serves:R1 changes:DES-89 -->

A not checked file gives one info line for each request that names its
files: `info originals-not-checked <record> <request> no place is set on
this machine for "<name>": <files>`. The Not known line names the files and
the requirements that depend on them. A not checked file alone gives no
`not ok`, so `al check --strict` passes where the files cannot be reached,
such as on CI. A sign-off whose file is not checked is never counted as
signed. Its other conditions (the `covers` entry, `signed` and `words`) are
checked in every state, and a failure of one stays `not ok`.

<!-- OE-10 note -->

## 3. Writing

<!-- OE-11 rule serves:R1 -->

`al new`, `al record <name> origin` and `al record <name> signoff`, in a
project that keeps its files outside:

1. Find the place. With no place set, refuse and write nothing. The
   previews of `al record origin` and `al record signoff` refuse too; a
   request with nothing to sign says so first.
2. Choose a name that is free in `origin/` in the repo and in
   `<folder>/<request>/`, and that the record does not name. Create the
   file there only if it does not exist yet. If another clone wrote it
   first, choose the next free name and try again.
3. If the write fails, refuse with the reason, and write nothing else.
4. Then write the record, and for a sign-off the `Signed off:` line in
   `request.md`. Both name the file by its name only (`origin/<file>`). The
   command's output names it as `originals:<request>/<file>`.

<!-- OE-20 rule serves:R1 builds-on:OE-11 -->

A file written in step 2 whose record then fails to write stays in the
folder, named by no record. That is no false record. A project that keeps
its files in the repo keeps today's rule: the name is free in `origin/`.

<!-- OE-12 data serves:R1 builds-on:OE-11 -->

A structured source that is a path inside the folder (`--url` of
`al record origin`, `--source` and `--presented` of `al record signoff`;
absolute, `~/`, or relative to the current folder) is recorded as
`originals:<path in the folder>`. The folder's path anywhere else in such a
value becomes `originals:`. This happens before the record is written and
before a file name is made from the value. The full value of `--url` or
`--source` stays in the snapshot, which is outside the repo. A
`--presented` value is kept only as the record holds it. `--words` is kept
as given.

<!-- OE-13 note -->

## 4. Concluding and export

<!-- OE-14 rule serves:R1 changes:DES-37 -->

`al conclude` checks each original file of the request again with the reader
of section 2, in the preview and with `--yes`. It refuses while one is not
checked or failed, and names each file and why. It does not run the checks
of other requests. So a request closes only where every one of its original
files is verified. A request whose original files are all in the repo and
verified needs no place. This also closes a gap: before this change,
`al conclude` did not check the record evidence of the request that it
closed, and closed a request whose original file was missing.

<!-- OE-15 interface serves:R1 changes:DES-61 builds-on:OE-8 -->

`al export` keeps its contract: the rows of a selected commit come from that
commit, and every row has its text. An original file outside the repo gets
no row, and the export does not read the folder. Each such file is named,
with its request, its name and its recorded SHA-256: on stderr when the
export goes to standard output, and in the summary with `--out`. Search uses
the same rows, so it does not change.

<!-- OE-16 note -->

## 5. Docs and tests

<!-- OE-17 plan serves:R1 -->

The README says how to set the config key and the places file, and what CI
shows. `specs/schema.md` gets the `originals` key. The skill gets one line:
if `al` says that no place is set for the original files, add the line that
it names. Code tests with no model cover each case above, each with its own
`XDG_CONFIG_HOME`. Moving the existing original files out of the repo and
out of its history is not in this change (#63).
