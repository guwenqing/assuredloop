// #72: the close rule by path, central removes, and no dispositions
// (requests/light-resign/request.md R5, signed; spec LD-57, LD-58, LD-40,
// LD-9, LD-56, LD-60, LD-61, LD-37; DES-69). Written from the requirement
// and the public interface only. Nothing here reads src/ or bin/.
//
// - `al conclude <name>` (a preview) and `al conclude <name> --yes`. A
//   refusal prints one or more lines that start with `refused: `, exits 1
//   and writes nothing, in the preview and with --yes.
// - Paths 2 and 3 are requests of Tier 2 or 3 that are not a spike. A spike
//   is Tier S. Paths 0, 1 and 1d close as today. On paths 2 and 3,
//   conclude refuses while:
//   1. a promise change has no signed requirement that covers it (as today):
//        refused: a promise change with no signed requirement that covers it: <IDs>
//   2. a signed requirement R<n> of the request's current version has no
//      declared link: a paragraph in specs/ whose marker has
//      `serves:<name>/R<n>`, or an ADR with `Status: accepted` whose marker
//      has `decides:<name>/R<n>`. The line names the requirement
//      (`<name>/R<n>`, or `R<n>` with the request name on the line) and
//      holds `no declared paragraph link`. `not built` never appears. A
//      requirement that the current version no longer holds is not asked
//      for. A proposed or superseded ADR, and a change spec paragraph's
//      `serves:`, are not declared links.
//   3. a change paragraph whose marker has `changes:<SPEC-ID>` while that
//      paragraph is unchanged since the link (the map's state), or
//      `removes:<SPEC-ID>` while that paragraph is still in specs/. The line
//      names the change paragraph, the spec paragraph, and
//      `unchanged since the link` or `still in specs/`.
// - A review judgement (requests/<name>/review.md) never clears a refusal.
// - A missing or stale consolidation judgement never refuses: it shows as
//   `hint map-consolidation`, and the request closes when items 1-3 hold.
// - A spike closes as today; an unsigned spike refuses as today.
// - Dispositions are gone: a record with no `dispositions:` entries closes
//   when items 1-3 hold. An old record that holds dispositions and a
//   decision with `wording:` stays readable: al check, al context and
//   al conclude run on it, with no finding of the code `disposition` or
//   `disposition-pending`. The output of al conclude never says
//   `disposition`.
// - In a central repo (its config lists `outputs:`), `removes:central:X`
//   is read as `removes:X` by each reader: the sign-off coverage of a
//   removal, the lost-ID lint, the target-removed hint, and item 3.
//
// "Fails today because ..." notes are in the report of the test author,
// not here. No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  al, appendSection, commitAll, doc, editFile, editRecord, editRequest, exists, index, newRequest, ok, organized, read, refused,
  req, write, writeConfig, writesNothing,
} from './helpers/project.js';
import { conclude, word } from './helpers/views.js';
import {
  CS, NAME, R1, SPEC, T12, T13, T41, addSpec, claim, editSpec, judged, note, removeSpec, show, world,
} from './helpers/map-68.js';

const PLAN = ['SP-9 plan', 'One PR: the link, then the email.'];
const N41 = 'The export link MUST expire 24 hours after it is created.';
const T50 = 'A shared export link MUST live for 24 hours.';
const R2 = req('R2', 'Reminders', 'A reminder email MUST go out 7 days after the due date.');

// index, then commit, as the author does at each step.
function save(dir, message = `${NAME}: work`) {
  index(dir);
  commitAll(dir, message);
}

// A part of a line: a string it includes, a RegExp it matches, or a test.
const matches = (line, part) => {
  if (typeof part === 'function') return part(line);
  return part instanceof RegExp ? part.test(line) : line.includes(part);
};
// The requirement R<n> of a request: `<name>/R<n>`, or `R<n>` and the name on the line.
const requirement = (name, id) => (line) => word(id).test(line) && line.includes(name);
const describe = (parts) => parts.map((p) => (typeof p === 'function' ? '<requirement>' : String(p))).join(' & ');

function noDisposition(r) {
  assert.doesNotMatch(r.stdout, /disposition/i, `al conclude never says "disposition":\n${show(r)}`);
}

// Conclude refuses in the preview and with --yes: exit 1, nothing written,
// a "refused: " line for each list of parts in `want`, and none for each
// list in `not`. Returns both runs.
function refuses(dir, want = [], { name = NAME, not = [] } = {}) {
  const runs = [conclude(dir, name), conclude(dir, name, '--yes')];
  for (const r of runs) {
    assert.equal(r.code, 1, show(r));
    assert.equal(r.wrote, false, `a refusal writes nothing:\n${show(r)}`);
    assert.ok(r.refused.length >= 1, `a "refused: " line:\n${show(r)}`);
  }
  for (const parts of want) refusedWith(runs, ...parts);
  for (const parts of not) notRefusedWith(runs, ...parts);
  for (const r of runs) {
    assert.doesNotMatch(r.stdout, /not built/, `al never says "not built":\n${show(r)}`);
    noDisposition(r);
  }
  return runs;
}
// In each run, a refused line that holds every part.
function refusedWith(runs, ...parts) {
  for (const r of runs) {
    assert.ok(r.refused.some((l) => parts.every((p) => matches(l, p))), `a refused line with ${describe(parts)}:\n${show(r)}`);
  }
}
// In each run, no refused line that holds every part.
function notRefusedWith(runs, ...parts) {
  for (const r of runs) {
    assert.deepEqual(r.refused.filter((l) => parts.every((p) => matches(l, p))), [], `no refused line with ${describe(parts)}:\n${show(r)}`);
  }
}

// The preview would conclude: exit 0, no refusal, nothing written.
function wouldClose(dir, name = NAME) {
  const r = conclude(dir, name);
  assert.equal(r.code, 0, show(r));
  assert.deepEqual(r.refused, [], show(r));
  assert.equal(r.wrote, false, `a preview writes nothing:\n${show(r)}`);
  assert.match(r.stdout, new RegExp(`^Would conclude ${name}: `, 'm'), show(r));
  assert.doesNotMatch(r.stdout, /not built/, show(r));
  noDisposition(r);
  return r;
}
// The preview would conclude, then --yes concludes and archives.
function closes(dir, name = NAME) {
  const p = wouldClose(dir, name);
  const y = conclude(dir, name, '--yes');
  assert.equal(y.code, 0, show(y));
  assert.deepEqual(y.refused, [], show(y));
  noDisposition(y);
  assert.ok(exists(dir, `requests/archive/${name}/request.md`), `the request is archived:\n${show(y)}`);
  assert.ok(!exists(dir, `requests/${name}`), `the open folder is gone:\n${show(y)}`);
  return [p, y];
}

const findings = (r, code) => r.stdout.split('\n').filter((l) => new RegExp(`^(not ok|hint|info) ${code} `).test(l));

// =====================================================================
// Fixtures. world() of map-68.js: main has specs/invoices.md (INV-1, INV-12,
// INV-13, INV-41) and ADR-3; the branch feature has the own request share,
// Tier 2, R1 signed, and its change spec, indexed and committed.

// Item 2 holds (INV-50 serves share/R1); SP-1 changes INV-41, which is
// unchanged since the link; SP-3 removes INV-13, which is still in specs/.
function openLinks(t, paras = [
  ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'],
  ['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.'],
  PLAN,
]) {
  const dir = world(t, paras);
  addSpec(dir, 'INV-50 rule serves:share/R1', T50);
  save(dir, `${NAME}: INV-50`);
  return dir;
}

// Items 1-3 hold: SP-1 changes INV-41, and INV-41 is rewritten and serves share/R1.
function ready(t) {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  save(dir, `${NAME}: INV-41`);
  return dir;
}

// R1 is served only by a change paragraph: no paragraph of specs/ and no ADR links to it.
function unlinked(t) {
  const dir = world(t, [['SP-1 rule serves:R1', 'A shared export link lives for 24 hours.'], PLAN]);
  return dir;
}

// An ADR file ADR-4 with the status line and a decides link to share/R1.
function adr(dir, status) {
  write(dir, 'specs/adr/0004-shared-links.md', `Status: ${status}\n\n${doc([
    ['ADR-4 choice decides:share/R1', '# ADR-4: Shared links'],
    ['ADR-4-1 rationale', 'Context: a shared link lives for one day.'],
  ])}`);
}

// =====================================================================
// Item 1: a promise change with no signed requirement (as today)

test('#72 item 1: an added rule INV-60 with no signed requirement refuses, in the preview and with --yes, and names INV-60', (t) => {
  const dir = ready(t);
  addSpec(dir, 'INV-60 rule', 'An export link MUST be signed.');
  save(dir, `${NAME}: INV-60`);
  refuses(dir, [['a promise change with no signed requirement that covers it', word('INV-60')]], { not: [[word('INV-41')]] });
});

// =====================================================================
// Item 2: each signed requirement of the current version has a declared link

test('#72 item 2: R1 served only by a change paragraph refuses with "no declared paragraph link"; the change spec\'s serves: is not a declared link', (t) => {
  const dir = unlinked(t);
  refuses(dir, [[requirement(NAME, 'R1'), 'no declared paragraph link']]);
});

test('#72 item 2 control: a paragraph of specs/ with serves:share/R1 is a declared link: conclude closes', (t) => {
  const dir = unlinked(t);
  addSpec(dir, 'INV-50 rule serves:share/R1', T50);
  save(dir, `${NAME}: INV-50`);
  closes(dir);
});

test('#72 item 2: an accepted ADR with decides:share/R1 is a declared link: conclude closes', (t) => {
  const dir = unlinked(t);
  adr(dir, 'accepted');
  save(dir, `${NAME}: ADR-4`);
  closes(dir);
});

test('#72 item 2: a proposed ADR with decides:share/R1 is not a declared link: conclude refuses on R1', (t) => {
  const dir = unlinked(t);
  adr(dir, 'proposed');
  save(dir, `${NAME}: ADR-4 proposed`);
  refuses(dir, [[requirement(NAME, 'R1'), 'no declared paragraph link']]);
});

test('#72 item 2: a superseded ADR with decides:share/R1 is not a declared link: conclude refuses on R1', (t) => {
  const dir = unlinked(t);
  adr(dir, 'superseded by ADR-3');
  save(dir, `${NAME}: ADR-4 superseded`);
  refuses(dir, [[requirement(NAME, 'R1'), 'no declared paragraph link']]);
});

// share with R1 and R2 signed in S1, its change spec, indexed and committed.
function twoRequirements(t) {
  const dir = world(t, null, { link: false });
  newRequest(dir, NAME, `The owner wants ${NAME}.\n`, ['--tier', '2']);
  appendSection(dir, NAME, organized([R1, R2]));
  ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, CS, doc([['SP-1 approach serves:R1', 'Reuse the export link.'], ['SP-2 approach serves:R2', 'A daily job sends the reminders.'], PLAN]));
  save(dir, claim(NAME));
  return dir;
}

test('#72 item 2: R1 and R2 signed, only R1 has a declared link: the refusal names R2 and not R1', (t) => {
  const dir = twoRequirements(t);
  addSpec(dir, 'INV-50 rule serves:share/R1', T50);
  save(dir, `${NAME}: INV-50`);
  refuses(dir, [[requirement(NAME, 'R2'), 'no declared paragraph link']], { not: [[word('R1')]] });
});

test('#72 item 2: a requirement that the owner dropped (R2, signed in S1, gone from request.md and re-signed) is not asked for: conclude closes', (t) => {
  const dir = twoRequirements(t);
  editRequest(dir, NAME, R2.block, '');
  write(dir, CS, doc([['SP-1 approach serves:R1', 'Reuse the export link.'], PLAN]));
  ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Drop R2, sign it', '--yes']);
  addSpec(dir, 'INV-50 rule serves:share/R1', T50);
  save(dir, `${NAME}: R2 dropped, INV-50`);
  const [p] = closes(dir);
  assert.doesNotMatch(p.stdout, word('R2'), `R2 is not asked for:\n${show(p)}`);
});

// =====================================================================
// Item 3: changes and removes

test('#72 item 3: SP-1 changes INV-41, unchanged since the link: refuses with a line that names SP-1, INV-41 and "unchanged since the link"', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  refuses(dir, [[word('SP-1'), word('INV-41'), 'unchanged since the link']]);
});

test('#72 item 3 control: INV-41 changed since the link: conclude closes', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  save(dir, `${NAME}: INV-41`);
  closes(dir);
});

test('#72 item 3: INV-41 changed, then put back to the linked text: unchanged since the link again, and conclude refuses', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  save(dir, `${NAME}: INV-41`);
  wouldClose(dir);
  editFile(dir, SPEC, N41, T41);
  save(dir, `${NAME}: INV-41 back`);
  refuses(dir, [[word('SP-1'), word('INV-41'), 'unchanged since the link']]);
});

test('#72 item 3: SP-3 removes INV-13, still in specs/: refuses with a line that names SP-3, INV-13 and "still in specs/"', (t) => {
  const dir = openLinks(t, [['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.'], PLAN]);
  refuses(dir, [[word('SP-3'), word('INV-13'), 'still in specs/']]);
});

test('#72 item 3 control: INV-13 removed from specs/: conclude closes', (t) => {
  const dir = openLinks(t, [['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.'], PLAN]);
  removeSpec(dir, 'INV-13', T13);
  save(dir, `${NAME}: INV-13 removed`);
  closes(dir);
});

test('#72 item 3: SP-1 and SP-3 both open: one refused line for each, each with its own reason', (t) => {
  const dir = openLinks(t);
  refuses(dir, [
    [word('SP-1'), word('INV-41'), 'unchanged since the link'],
    [word('SP-3'), word('INV-13'), 'still in specs/'],
  ], { not: [[word('INV-41'), 'still in specs/'], [word('INV-13'), 'unchanged since the link']] });
});

// =====================================================================
// A review judgement never clears a refusal

test('#72 a review judgement that says complies on SP-1 and on R1 changes no refusal: items 2 and 3 still refuse, with the same lines', (t) => {
  const dir = world(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  const before = refuses(dir, [
    [requirement(NAME, 'R1'), 'no declared paragraph link'],
    [word('SP-1'), word('INV-41'), 'unchanged since the link'],
  ]);
  note(dir,
    judged('SP-1 complies: INV-41 already says what SP-1 means.', 'Item: "lives for 24 hours"', `Spec (INV-41): "${T41}"`),
    judged('R1 complies: the export link of INV-41 meets it.', `Spec (INV-41): "${T41}"`));
  save(dir, `${NAME}: the review`);
  const after = refuses(dir, [
    [requirement(NAME, 'R1'), 'no declared paragraph link'],
    [word('SP-1'), word('INV-41'), 'unchanged since the link'],
  ]);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual([...after[i].refused].sort(), [...before[i].refused].sort(), `the same refusals:\n${show(after[i])}`);
  }
});

// =====================================================================
// A missing or stale consolidation judgement never refuses (LD-60)

test('#72 no consolidation judgement: conclude shows hint map-consolidation for SP-1 and closes', (t) => {
  const dir = ready(t);
  const [p, y] = closes(dir);
  for (const r of [p, y]) {
    assert.ok(r.stdout.split('\n').some((l) => l.startsWith('hint map-consolidation ') && word('SP-1').test(l)), `hint map-consolidation SP-1:\n${show(r)}`);
  }
});

test('#72 a stale consolidation judgement: conclude shows hint map-consolidation for SP-1 and closes', (t) => {
  const dir = ready(t);
  note(dir, judged('SP-1 complies: the link rule is INV-41.', 'Item: "lives for 24 hours"', `Spec (INV-41): "${N41}"`));
  save(dir, `${NAME}: the review`);
  editSpec(dir, 'INV-41', 'rule', N41, 'The export link MUST expire 48 hours after it is created.', { serves: null });
  save(dir, `${NAME}: INV-41 again`);
  const [p] = closes(dir);
  assert.ok(p.stdout.split('\n').some((l) => l.startsWith('hint map-consolidation ') && word('SP-1').test(l)), `hint map-consolidation SP-1:\n${show(p)}`);
});

// =====================================================================
// A spike, and path 1, close as today

const SPIKE_Q = { id: 'Q1', block: '<!-- Q1 -->\n\n### Q1 Signed links\nCan a signed link replace the token table?\n' };

function spike(t) {
  const dir = world(t, null, { link: false });
  newRequest(dir, 'spike-a', 'Can we sign links?\n', ['--tier', 'S']);
  appendSection(dir, 'spike-a', organized([SPIKE_Q], { heading: '## Organized question' }));
  ok(dir, ['record', 'spike-a', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, 'requests/spike-a/spec.md', doc([
    ['SP-1 approach serves:Q1', 'Try an HMAC over the invoice ID.'],
    ['SP-2 rule serves:Q1 changes:INV-41', 'A signed link MUST expire after 30 minutes.'],
  ]));
  save(dir, claim('spike-a', 'S'));
  return dir;
}

test('#72 a signed spike closes: no consolidation, no declared link and no changed INV-41 are asked for', (t) => {
  closes(spike(t), 'spike-a');
});

test('#72 a spike whose question changed after the sign-off refuses on Q1, as today', (t) => {
  const dir = spike(t);
  editRequest(dir, 'spike-a', 'Can a signed link replace the token table?', 'Can a signed link replace the table?');
  save(dir, 'spike-a: Q1 changed');
  refuses(dir, [[word('Q1'), 'not signed']], { name: 'spike-a', not: [['no declared paragraph link'], ['unchanged since the link']] });
});

test('#72 path 1: a Tier 1 request with R1 signed, no declared link and an unchanged INV-41 closes; items 2 and 3 do not apply', (t) => {
  const dir = world(t, null, { link: false });
  newRequest(dir, 'fix', 'Fix the link.\n', ['--tier', '1']);
  appendSection(dir, 'fix', organized([R1]));
  ok(dir, ['record', 'fix', 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  write(dir, 'requests/fix/spec.md', doc([['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.']]));
  save(dir, claim('fix', '1'));
  closes(dir, 'fix');
});

// =====================================================================
// Dispositions are gone (LD-58, LD-9)

test('#72 a record with no dispositions closes when items 1-3 hold; the output never says "disposition"', (t) => {
  const dir = ready(t);
  editRecord(dir, NAME, (rec) => {
    assert.ok(!(rec.dispositions ?? []).length, 'the fixture has no disposition entries');
  });
  closes(dir);
});

test('#72 an old record with dispositions (incorporated, abandoned) and a wording decision stays readable: check, context and conclude run, with no disposition finding', (t) => {
  const dir = world(t, [
    ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'],
    ['SP-3 rule serves:R1', 'The email carries only the link.'],
    PLAN,
  ]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  ok(dir, ['record', NAME, 'decision', '--source', 'agent', '--text', 'Word SP-1 as INV-41.', '--yes']);
  editRecord(dir, NAME, (rec) => {
    rec.decisions[0].wording = { source: `${NAME}/SP-1`, spec: 'INV-41' };
    rec.dispositions = [
      { source: `${NAME}/SP-1`, disposition: 'incorporated', spec: 'INV-41' },
      { source: `${NAME}/SP-3`, disposition: 'abandoned' },
    ];
  });
  save(dir, `${NAME}: INV-41, an old record`);

  for (const args of [['check'], ['check', '--strict'], ['context', NAME]]) {
    const r = al(dir, args);
    assert.equal(r.code, 0, show(r));
    assert.deepEqual(findings(r, 'disposition'), [], `no disposition finding:\n${show(r)}`);
    assert.deepEqual(findings(r, 'disposition-pending'), [], `no disposition-pending finding:\n${show(r)}`);
  }
  closes(dir);
});

// =====================================================================
// Central removes (DES-69): removes:central:INV-13 reads as removes:INV-13

const FORMS = ['INV-13', 'central:INV-13'];

// The central repo: its config lists an output repo (the clone is absent).
// share: SP-3 removes INV-13 in `form`; INV-50 serves share/R1; INV-70
// builds on INV-13. Indexed and committed; INV-13 still in specs/.
function central(t, form) {
  const dir = world(t, [['SP-3 limit serves:R1 removes:' + form, 'An invoice may have no line now.'], PLAN], {
    onMain: (d) => writeConfig(d, [{ file: SPEC, prefix: 'INV' }], {
      repo: 'invoicer', outputs: [{ name: 'invoicer-web', path: '../al-v4-72-no-such-clone' }],
    }),
  });
  addSpec(dir, 'INV-50 rule serves:share/R1', T50);
  addSpec(dir, 'INV-70 rule serves:share/R1 builds-on:INV-13', 'A total MUST sum the lines of the invoice.');
  save(dir, `${NAME}: INV-50 and INV-70`);
  return dir;
}
function centralRemoved(t, form) {
  const dir = central(t, form);
  removeSpec(dir, 'INV-13', T13);
  save(dir, `${NAME}: INV-13 removed`);
  return dir;
}
const checkRun = (dir) => {
  const r = al(dir, ['check']);
  assert.equal(r.code, 0, show(r));
  return r;
};

test('#72 central a. sign-off coverage: a signed removal written removes:central:INV-13 gives no not ok signoff-coverage for INV-13, as the bare form does', (t) => {
  for (const form of FORMS) {
    const r = checkRun(centralRemoved(t, form));
    assert.deepEqual(r.stdout.split('\n').filter((l) => l.startsWith('not ok signoff-coverage ') && word('INV-13').test(l)), [],
      `removes:${form}: no not ok signoff-coverage for INV-13:\n${show(r)}`);
  }
});

test('#72 central b. the lost-ID lint: INV-13 removed with removes:central:INV-13 gives no lost-id hint for INV-13, as the bare form does', (t) => {
  for (const form of FORMS) {
    const r = checkRun(centralRemoved(t, form));
    assert.deepEqual(findings(r, 'lost-id').filter((l) => word('INV-13').test(l)), [], `removes:${form}: no lost-id for INV-13:\n${show(r)}`);
  }
});

test('#72 central c. target-removed: INV-70, which builds on INV-13, gets hint target-removed naming share for both forms, and no unresolved-link', (t) => {
  for (const form of FORMS) {
    const r = checkRun(centralRemoved(t, form));
    const hits = findings(r, 'target-removed').filter((l) => word('INV-70').test(l) && word('INV-13').test(l));
    assert.equal(hits.length, 1, `removes:${form}: one target-removed for INV-70 on INV-13:\n${show(r)}`);
    assert.match(hits[0], /target removed by share\b/, `removes:${form}: it names the remover request:\n${show(r)}`);
    assert.deepEqual(findings(r, 'unresolved-link').filter((l) => word('INV-70').test(l)), [], `removes:${form}: no unresolved-link:\n${show(r)}`);
  }
});

test('#72 central d. item 3: removes:central:INV-13 refuses while INV-13 is in specs/ and closes when it is gone, as the bare form does', (t) => {
  for (const form of FORMS) {
    const dir = central(t, form);
    refuses(dir, [[word('SP-3'), word('INV-13'), 'still in specs/']]);
    removeSpec(dir, 'INV-13', T13);
    save(dir, `${NAME}: INV-13 removed`);
    closes(dir);
  }
});

// =====================================================================
// The close line (LD-62)
//
// - `al record <name> close --on <ID> --reason "<one sentence>" [--yes]`.
//   --on is an own ID of the request: a change paragraph (SP-4 or
//   <name>/SP-4) or a requirement R<n> of its current version. Any other
//   ID, a missing --on or --reason, a reason with a line break, or an
//   archived request refuses: exit 2, an `al: ` line, nothing written.
// - Without --yes it writes nothing and shows the line it would add, with
//   C<n>, the --on ID and the reason. With --yes it writes the request
//   record and shows the same line. The first is C1, the next C2.
// - The spec paragraphs that the reason names: each word in al's ID form
//   other than the --on ID (`central:INV-41` in a central repo reads as
//   INV-41). One that is a paragraph of specs/ now is listed on its own
//   line with `keeps` and the ID; one that is not is listed as
//   `<ID>: not a paragraph of specs/, not kept`. Neither refuses.
// - al conclude (preview and --yes) and al context <name> print one line
//   for the latest close line of each --on ID: `close`, C<n>, the --on ID,
//   `current` or `stale`, and the reason. A stale line names each ID whose
//   version changed and says to record it again.
// - A current close line on a change paragraph clears item 3 for it; on
//   R<n>, item 2 for it. A stale one clears nothing. A new close line on
//   the same ID makes it current again. Item 1 is never cleared.
//
// The YAML shape of the record is not asserted. A stale line is read as
// naming the changed ID outside the reason: for the --on ID, a second
// time.

const recordClose = (dir, on, reason, ...extra) => al(dir, ['record', NAME, 'close', '--on', on, '--reason', reason, ...extra]);
const closeArgs = (on, reason, ...extra) => ['record', NAME, 'close', '--on', on, '--reason', reason, ...extra];
const recordFile = `.assuredloop/records/requests/${NAME}.yaml`;

// The line that record close shows: C<n>, the --on ID and the reason.
function addedLine(r, cid, on, reason) {
  const found = r.stdout.split('\n').filter((l) => word(cid).test(l) && word(on).test(l) && l.includes(reason));
  assert.ok(found.length >= 1, `a line with ${cid}, ${on} and the reason:\n${show(r)}`);
  return found[0];
}

// record close --yes: exit 0, the request record changes, and the added line.
function closeLineAdd(dir, cid, on, reason) {
  const before = read(dir, recordFile);
  const r = recordClose(dir, on, reason, '--yes');
  assert.equal(r.code, 0, show(r));
  assert.notEqual(read(dir, recordFile), before, `--yes writes the request record:\n${show(r)}`);
  addedLine(r, cid, on, reason);
  return r;
}

const occurrences = (text, id) => (text.match(new RegExp(word(id).source, 'g')) ?? []).length;
const closeLinesOf = (r, cid) => r.stdout.split('\n').filter((l) => !l.startsWith('refused: ') && /\bclose\b/.test(l) && word(cid).test(l));

// The one close line of cid in a view, in the given state. Returns the line
// and the line without its reason.
function closeLine(r, { cid, on, reason, state }) {
  const found = closeLinesOf(r, cid).filter((l) => word(on).test(l) && l.includes(reason));
  assert.equal(found.length, 1, `one close line with ${cid}, ${on} and the reason:\n${show(r)}`);
  const rest = found[0].replace(reason, '');
  const other = state === 'current' ? 'stale' : 'current';
  assert.match(rest, new RegExp(`\\b${state}\\b`), `${cid} is ${state}:\n${found[0]}\n${show(r)}`);
  assert.doesNotMatch(rest, new RegExp(`\\b${other}\\b`), `${cid} is not ${other}:\n${found[0]}\n${show(r)}`);
  if (state === 'stale') assert.match(rest, /\bagain\b/, `a stale line says to record it again:\n${found[0]}\n${show(r)}`);
  return { line: found[0], rest };
}

// al context <name>: exit 0, nothing written.
function context(dir) {
  const r = writesNothing(dir, ['context', NAME]);
  return r;
}

const NOT_NOW = 'Not delivered: the owner keeps the 30-minute expiry for this release.';

test('#72 close: the preview writes nothing and shows C1, SP-1 and the reason; --yes writes the record and shows it; the next one is C2', (t) => {
  const dir = openLinks(t);
  const p = writesNothing(dir, closeArgs('SP-1', NOT_NOW));
  addedLine(p, 'C1', 'SP-1', NOT_NOW);
  closeLineAdd(dir, 'C1', 'SP-1', NOT_NOW);
  const other = 'Not delivered: invoices keep at least one line for now.';
  const p2 = writesNothing(dir, closeArgs(`${NAME}/SP-3`, other));
  addedLine(p2, 'C2', 'SP-3', other);
  closeLineAdd(dir, 'C2', 'SP-3', other);
});

test('#72 close: --on R1, a requirement of the current version, is taken', (t) => {
  const dir = unlinked(t);
  addedLine(writesNothing(dir, closeArgs('R1', 'The existing export design meets it.')), 'C1', 'R1', 'The existing export design meets it.');
  closeLineAdd(dir, 'C1', 'R1', 'The existing export design meets it.');
});

test('#72 close refuses (exit 2, al: , nothing written): --on a spec paragraph, an unknown SP or R, no --on, no --reason, a reason with a line break', (t) => {
  const dir = openLinks(t);
  // Control: the same command with an own ID is taken.
  addedLine(writesNothing(dir, closeArgs('SP-1', NOT_NOW)), 'C1', 'SP-1', NOT_NOW);
  for (const yes of [[], ['--yes']]) {
    refused(dir, closeArgs('INV-41', NOT_NOW, ...yes));
    refused(dir, closeArgs('SP-99', NOT_NOW, ...yes));
    refused(dir, closeArgs('R9', NOT_NOW, ...yes));
    refused(dir, ['record', NAME, 'close', '--reason', NOT_NOW, ...yes]);
    refused(dir, ['record', NAME, 'close', '--on', 'SP-1', ...yes]);
    refused(dir, closeArgs('SP-1', 'Not delivered.\nThe owner keeps the old expiry.', ...yes));
  }
});

test('#72 close refuses on an archived request', (t) => {
  const dir = ready(t);
  // Control: before the request is archived, the command is taken.
  addedLine(writesNothing(dir, closeArgs('SP-1', NOT_NOW)), 'C1', 'SP-1', NOT_NOW);
  closes(dir);
  refused(dir, closeArgs('SP-1', NOT_NOW));
  refused(dir, closeArgs('SP-1', NOT_NOW, '--yes'));
});

test('#72 close: the reason names INV-12, INV-13 and INV-99: "keeps" INV-12 and INV-13, each on its own line; INV-99 is not a paragraph of specs/, not kept; the --on ID is not kept', (t) => {
  const dir = openLinks(t);
  const reason = 'SP-1 is not delivered: INV-12 and INV-13 already hold what it meant, and INV-99 was its old name.';
  const p = writesNothing(dir, closeArgs('SP-1', reason));
  const y = closeLineAdd(dir, 'C1', 'SP-1', reason);
  for (const r of [p, y]) {
    const ls = r.stdout.split('\n');
    const keeps = (id) => ls.filter((l) => /\bkeeps\b/.test(l) && word(id).test(l) && !l.includes(reason));
    assert.equal(keeps('INV-12').length, 1, `a keeps line for INV-12:\n${show(r)}`);
    assert.equal(keeps('INV-13').length, 1, `a keeps line for INV-13:\n${show(r)}`);
    assert.doesNotMatch(keeps('INV-12')[0], word('INV-13'), `each kept paragraph on its own line:\n${show(r)}`);
    assert.deepEqual(keeps('INV-99'), [], `INV-99 is not kept:\n${show(r)}`);
    assert.deepEqual(keeps('SP-1'), [], `the --on ID is not kept:\n${show(r)}`);
    assert.ok(ls.some((l) => l.includes('INV-99: not a paragraph of specs/, not kept')), `INV-99: not a paragraph of specs/, not kept:\n${show(r)}`);
    assert.ok(!ls.some((l) => /SP-1: not a paragraph of specs\//.test(l)), `the --on ID is not listed:\n${show(r)}`);
  }
});

test('#72 close in a central repo: central:INV-12 in the reason reads as INV-12 and is kept', (t) => {
  const dir = central(t, 'INV-13');
  const reason = 'Not delivered: central:INV-12 already holds it.';
  for (const r of [writesNothing(dir, closeArgs('SP-3', reason)), closeLineAdd(dir, 'C1', 'SP-3', reason)]) {
    const ls = r.stdout.split('\n').filter((l) => !l.includes(reason));
    assert.ok(ls.some((l) => /\bkeeps\b/.test(l) && word('INV-12').test(l)), `keeps INV-12:\n${show(r)}`);
    assert.ok(!ls.some((l) => l.includes('not a paragraph of specs/')), `nothing is "not a paragraph of specs/":\n${show(r)}`);
  }
});

test('#72 close clears item 3 for SP-1 (changes, unchanged since the link): conclude closes, and conclude and context show C1 current', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  closeLineAdd(dir, 'C1', 'SP-1', NOT_NOW);
  save(dir, `${NAME}: C1`);
  const want = { cid: 'C1', on: 'SP-1', reason: NOT_NOW, state: 'current' };
  closeLine(context(dir), want);
  const [p, y] = closes(dir);
  closeLine(p, want);
  closeLine(y, want);
});

test('#72 close clears item 3 for SP-3 (removes, still in specs/): conclude closes, and shows C1 current', (t) => {
  const dir = openLinks(t, [['SP-3 limit serves:R1 removes:INV-13', 'An invoice may have no line now.'], PLAN]);
  const reason = 'Not delivered: invoices keep at least one line for now.';
  closeLineAdd(dir, 'C1', 'SP-3', reason);
  save(dir, `${NAME}: C1`);
  const want = { cid: 'C1', on: 'SP-3', reason, state: 'current' };
  closeLine(context(dir), want);
  const [p, y] = closes(dir);
  closeLine(p, want);
  closeLine(y, want);
});

test('#72 a close line on SP-1 clears item 3 for SP-1 only: SP-3 still refuses', (t) => {
  const dir = openLinks(t);
  closeLineAdd(dir, 'C1', 'SP-1', NOT_NOW);
  save(dir, `${NAME}: C1`);
  const runs = refuses(dir, [[word('SP-3'), word('INV-13'), 'still in specs/']], { not: [[word('SP-1'), 'unchanged since the link']] });
  for (const r of runs) closeLine(r, { cid: 'C1', on: 'SP-1', reason: NOT_NOW, state: 'current' });
});

test('#72 close clears item 2 for R1 (met by a design that is reused): conclude closes, and shows C1 current', (t) => {
  const dir = unlinked(t);
  const reason = 'The export link of INV-41 is reused; no new paragraph is needed.';
  closeLineAdd(dir, 'C1', 'R1', reason);
  save(dir, `${NAME}: C1`);
  const want = { cid: 'C1', on: 'R1', reason, state: 'current' };
  closeLine(context(dir), want);
  const [p, y] = closes(dir);
  closeLine(p, want);
  closeLine(y, want);
});

test('#72 a close line goes stale when its change paragraph SP-1 changes: the refusal comes back; C2 on SP-1 is current and clears again, and C1 is not shown', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  closeLineAdd(dir, 'C1', 'SP-1', NOT_NOW);
  save(dir, `${NAME}: C1`);
  wouldClose(dir);
  editFile(dir, CS, 'A shared export link lives for 24 hours.', 'A shared export link lives for 12 hours.');
  save(dir, `${NAME}: SP-1 changed`);
  const stale = { cid: 'C1', on: 'SP-1', reason: NOT_NOW, state: 'stale' };
  const runs = refuses(dir, [[word('SP-1'), word('INV-41'), 'unchanged since the link']]);
  for (const r of [...runs, context(dir)]) {
    const { rest } = closeLine(r, stale);
    assert.ok(occurrences(rest, 'SP-1') >= 2, `the stale line names SP-1 as changed:\n${rest}\n${show(r)}`);
  }
  closeLineAdd(dir, 'C2', 'SP-1', NOT_NOW);
  save(dir, `${NAME}: C2`);
  const p = wouldClose(dir);
  closeLine(p, { cid: 'C2', on: 'SP-1', reason: NOT_NOW, state: 'current' });
  assert.deepEqual(closeLinesOf(p, 'C1'), [], `only the latest close line of SP-1:\n${show(p)}`);
});

test('#72 a close line goes stale when its requirement R1 changes (re-signed): the refusal on R1 comes back; C2 on R1 is current and clears again', (t) => {
  const dir = unlinked(t);
  const reason = 'The existing export design meets it.';
  closeLineAdd(dir, 'C1', 'R1', reason);
  save(dir, `${NAME}: C1`);
  wouldClose(dir);
  editRequest(dir, NAME, 'MUST live for 24 hours', 'MUST live for 48 hours');
  ok(dir, ['record', NAME, 'signoff', '--source', 'owner', '--words', 'Yes, sign it', '--yes']);
  save(dir, `${NAME}: R1 changed and signed`);
  const runs = refuses(dir, [[requirement(NAME, 'R1'), 'no declared paragraph link']]);
  for (const r of [...runs, context(dir)]) {
    const { rest } = closeLine(r, { cid: 'C1', on: 'R1', reason, state: 'stale' });
    assert.ok(occurrences(rest, 'R1') >= 2, `the stale line names R1 as changed:\n${rest}\n${show(r)}`);
  }
  closeLineAdd(dir, 'C2', 'R1', reason);
  save(dir, `${NAME}: C2`);
  closeLine(wouldClose(dir), { cid: 'C2', on: 'R1', reason, state: 'current' });
});

test('#72 a close line goes stale when a spec paragraph that its reason names changes (INV-12): it names INV-12 and not INV-13, and the refusal comes back', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  const reason = 'Not delivered: INV-12 and INV-13 already hold what it meant.';
  closeLineAdd(dir, 'C1', 'SP-1', reason);
  save(dir, `${NAME}: C1`);
  wouldClose(dir);
  editSpec(dir, 'INV-12', 'data', T12, 'An invoice has a number, a customer, a currency, lines, a total and a paid date.');
  save(dir, `${NAME}: INV-12 changed`);
  const runs = refuses(dir, [[word('SP-1'), word('INV-41'), 'unchanged since the link']]);
  for (const r of [...runs, context(dir)]) {
    const { rest } = closeLine(r, { cid: 'C1', on: 'SP-1', reason, state: 'stale' });
    assert.match(rest, word('INV-12'), `the stale line names INV-12:\n${rest}\n${show(r)}`);
    assert.doesNotMatch(rest, word('INV-13'), `INV-13 did not change:\n${rest}\n${show(r)}`);
  }
});

test('#72 a close line goes stale when a spec paragraph that its reason names leaves specs/ (INV-13): it names INV-13, and the refusal on SP-1 comes back', (t) => {
  const dir = openLinks(t, [['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'], PLAN]);
  const reason = 'Not delivered: INV-13 already holds what it meant.';
  closeLineAdd(dir, 'C1', 'SP-1', reason);
  save(dir, `${NAME}: C1`);
  wouldClose(dir);
  removeSpec(dir, 'INV-13', T13);
  save(dir, `${NAME}: INV-13 gone`);
  const runs = refuses(dir, [[word('SP-1'), word('INV-41'), 'unchanged since the link']]);
  for (const r of [...runs, context(dir)]) {
    const { rest } = closeLine(r, { cid: 'C1', on: 'SP-1', reason, state: 'stale' });
    assert.match(rest, word('INV-13'), `the stale line names INV-13:\n${rest}\n${show(r)}`);
  }
});

test('#72 a close line never clears item 1: on SP-5, an unsigned promise change, it clears item 3 for SP-5 and the sign-off refusal stays', (t) => {
  const dir = world(t, [
    ['SP-1 rule serves:R1 changes:INV-41', 'A shared export link lives for 24 hours.'],
    ['SP-5 rule changes:INV-12', 'An invoice has a currency.'],
    PLAN,
  ]);
  editSpec(dir, 'INV-41', 'rule', T41, N41);
  save(dir, `${NAME}: INV-41`);
  refuses(dir, [
    ['a promise change with no signed requirement that covers it', word('SP-5')],
    [word('SP-5'), word('INV-12'), 'unchanged since the link'],
  ]);
  const reason = 'Not delivered: the currency waits for a later change.';
  closeLineAdd(dir, 'C1', 'SP-5', reason);
  save(dir, `${NAME}: C1`);
  const runs = refuses(dir, [['a promise change with no signed requirement that covers it', word('SP-5')]], {
    not: [[word('SP-5'), 'unchanged since the link']],
  });
  for (const r of runs) closeLine(r, { cid: 'C1', on: 'SP-5', reason, state: 'current' });
});
