// #88: a hint clears by a fix, or by a recorded one-line judgement with its
// reason (LD-12 of requests/light-design/spec.md; adr-rewrite/R1). This
// replaces `al index --align`. Written before the code, from the issue and
// the agreed behaviour:
//
// - `al record <name> judgement --hint <code> --on <ID> --reason <why>
//   [--yes]` works for every hint code. --on is the ID that the hint line
//   shows; when that ID is "-", the hint's path. <name> is an open request.
//   With no such hint now, the command refuses.
// - The judgement is one entry J<n> in the request record's judgements:. It
//   keeps the versions of both sides of the hint, and the hint is cleared
//   while they equal now. When one side changes, the hint comes back and
//   names the judgement as stale.
// - On stale-base or holder-changed, it moves each binding of that holder
//   that has the named hint to the versions of now, in the record of <name>
//   only, and the binding gets `judgement: J<n>`.
// - A judgement never clears a not ok: it is shown, and changes neither
//   --strict nor al conclude.
// - `al index --align` is removed, and says which command replaces it.
//
// The ID-only edits, the moves and the old records are in
// judgement-88-moves.test.js. Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, INVOICES, al, appendSection, binding, commitAll, doc, editFile, editRecord, editRequest, git, hashOf, index, move,
  newRequest, organized, project, read, record, refused, req, show, write, writeConfig, writesNothing,
} from './helpers/project.js';
import {
  ADR3_FILE, ADR3_MARKER, ADR3_MARKER_B, CS, NAME, R1, R1b, REC, SPEC, T, base, check, coded, hasBlock, hasLines, judge,
  judgedLine, judgementArgs, namesNoJudgement, namesStale, nextIs, noJudgedLine, none, onLink, one, world,
} from './helpers/judgement-88.js';

const R1_MESSAGE = (id) => `${id}'s text changed: check that its decision is unchanged; if the decision changed, write a new ADR that supersedes it`;
const adrChanged = (r, id = 'ADR-3') => coded(r, 'adr-changed', id);
const judgementsOf = (dir, name = NAME) => record(dir, name).judgements ?? [];

function assertEntry(dir, id, hint, on, reason, name = NAME) {
  const found = judgementsOf(dir, name).filter((j) => j.id === id);
  assert.equal(found.length, 1, `one entry ${id} in the judgements of ${name}:\n${read(dir, `.assuredloop/records/requests/${name}.yaml`)}`);
  const [j] = found;
  assert.equal(j.hint, hint);
  assert.equal(j.on, on);
  assert.equal(j.reason, reason);
  assert.ok(String(j.recorded).startsWith(DAY), `recorded on ${DAY}: ${j.recorded}`);
  return j;
}

// =====================================================================
// adr-changed (adr-rewrite/R1): an accepted ADR

describe('adr-changed on an accepted ADR: a judgement clears it until the text or the marker line changes again', () => {
  const WHY = 'Reworded; the decision is unchanged.';
  function rewritten(t) {
    const dir = world(t);
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    return dir;
  }

  test('without --yes: "Would add to <record>:" and the line J1, nothing written, and the hint stays', (t) => {
    const dir = rewritten(t);
    one(adrChanged(check(dir)), check(dir), 'adr-changed on ADR-3 before the judgement');
    const r = writesNothing(dir, judgementArgs('adr-changed', 'ADR-3', WHY, { yes: false }));
    hasLines(r, [`Would add to ${REC}:`, `J1 adr-changed ADR-3: ${WHY}`]);
    const after = check(dir);
    one(adrChanged(after), after, 'adr-changed on ADR-3 after a dry run');
    assert.deepEqual(judgementsOf(dir), [], 'no judgement is recorded');
  });

  test('with --yes: "Added to <record>:", the line J1, Next al check; the record holds J1; al check gives no adr-changed and one info judged line, also after a commit', (t) => {
    const dir = rewritten(t);
    const r = judge(dir, 'adr-changed', 'ADR-3', WHY);
    hasLines(r, [`Added to ${REC}:`, `J1 adr-changed ADR-3: ${WHY}`]);
    nextIs(r, 'al check');
    assertEntry(dir, 'J1', 'adr-changed', 'ADR-3', WHY);
    for (const when of ['in the working tree', 'after a commit']) {
      if (when === 'after a commit') commitAll(dir, 'Reword ADR-3, with the judgement J1');
      const c = check(dir);
      assert.equal(c.code, 0, show(c));
      none(adrChanged(c), c, `adr-changed on ADR-3 ${when}`);
      assert.equal(judgedLine(c), `${NAME}/J1 adr-changed ADR-3: ${WHY}`, show(c));
    }
  });

  test('a second edit of the text: the hint comes back and names the judgement as stale; no info judged line; the judged text again clears it', (t) => {
    const dir = rewritten(t);
    judge(dir, 'adr-changed', 'ADR-3', WHY);
    commitAll(dir, 'Reword ADR-3, with the judgement J1');
    editFile(dir, ADR3_FILE, T.ADRb, T.ADRc);
    let r = check(dir);
    const f = one(adrChanged(r), r, 'adr-changed on ADR-3 after the second edit');
    assert.ok(f.msg.startsWith(R1_MESSAGE('ADR-3')), show(r));
    namesStale(f, r, 1);
    noJudgedLine(r);
    editFile(dir, ADR3_FILE, T.ADRc, T.ADRb);
    r = check(dir);
    none(adrChanged(r), r, 'adr-changed on ADR-3 with the judged text back');
    assert.equal(judgedLine(r), `${NAME}/J1 adr-changed ADR-3: ${WHY}`, show(r));
  });

  test('an edit of the marker line after the judgement: the hint comes back and names the judgement as stale', (t) => {
    const dir = rewritten(t);
    judge(dir, 'adr-changed', 'ADR-3', WHY);
    commitAll(dir, 'Reword ADR-3, with the judgement J1');
    editFile(dir, ADR3_FILE, ADR3_MARKER, ADR3_MARKER_B);
    const r = check(dir);
    namesStale(one(adrChanged(r), r, 'adr-changed on ADR-3 after the marker edit'), r, 1);
    noJudgedLine(r);
  });

  test('a judgement made when only the marker line changed: an edit of the text brings the hint back as stale', (t) => {
    const dir = world(t);
    editFile(dir, ADR3_FILE, ADR3_MARKER, '<!-- ADR-3 rationale -->');
    one(adrChanged(check(dir)), check(dir), 'adr-changed on ADR-3 for a changed kind');
    judge(dir, 'adr-changed', 'ADR-3', 'The kind was wrong; the decision is unchanged.');
    none(adrChanged(check(dir)), check(dir), 'adr-changed after the judgement');
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    const r = check(dir);
    namesStale(one(adrChanged(r), r, 'adr-changed on ADR-3 after the text edit'), r, 1);
  });
});

// =====================================================================
// adr-changed (adr-rewrite/R1): a superseded ADR

describe('adr-changed on a superseded ADR: a judgement clears it until the text changes again', () => {
  // main: ADR-3 superseded by ADR-4, ADR-4 accepted with supersedes:ADR-3.
  // The branch: the request inv; then ADR-3's text is rewritten.
  function superseded(t) {
    const dir = project(t);
    writeConfig(dir);
    write(dir, SPEC, INVOICES);
    write(dir, ADR3_FILE, `Status: superseded by ADR-4\n\n${doc([['ADR-3 choice', '# ADR-3: Signed links'], ['ADR-3-1 rationale', T.ADR]])}`);
    write(dir, 'specs/adr/0004-one-time-links.md', `Status: accepted\n\n${doc([['ADR-4 choice supersedes:ADR-3', '# ADR-4: One-time links'], ['ADR-4-1 rationale', 'Context: a link works once.']])}`);
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '2']);
    appendSection(dir, NAME, organized([R1]));
    index(dir);
    commitAll(dir, 'The request inv\n\nTier: 2 — inv');
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    return dir;
  }

  test('rewritten: hint adr-changed on ADR-3; the judgement clears it; a second edit brings it back as stale', (t) => {
    const dir = superseded(t);
    let r = check(dir);
    assert.ok(one(adrChanged(r), r, 'adr-changed on the superseded ADR-3').msg.startsWith(R1_MESSAGE('ADR-3')), show(r));
    const WHY = 'Reworded; the replaced decision reads the same.';
    judge(dir, 'adr-changed', 'ADR-3', WHY);
    assertEntry(dir, 'J1', 'adr-changed', 'ADR-3', WHY);
    r = check(dir);
    none(adrChanged(r), r, 'adr-changed on ADR-3 after the judgement');
    assert.equal(judgedLine(r), `${NAME}/J1 adr-changed ADR-3: ${WHY}`, show(r));
    editFile(dir, ADR3_FILE, T.ADRb, T.ADRc);
    r = check(dir);
    namesStale(one(adrChanged(r), r, 'adr-changed on ADR-3 after the second edit'), r, 1);
  });
});

// =====================================================================
// stale-base: a binding whose target changed

describe('stale-base: the judgement moves the binding to now, with judgement: J<n>, in the record of <name>', () => {
  const WHY = 'SP-1 still builds on the invoice data.';
  function staleTarget(t) {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    return dir;
  }

  test('before: hint stale-base on inv/SP-1 builds-on INV-12; without --yes: the J1 line and a "moves" line, nothing written', (t) => {
    const dir = staleTarget(t);
    const before = check(dir);
    one(onLink(before, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), before, 'stale-base on inv/SP-1 builds-on INV-12');
    const r = writesNothing(dir, judgementArgs('stale-base', 'inv/SP-1', WHY, { yes: false }));
    hasLines(r, [`Would add to ${REC}:`, `J1 stale-base inv/SP-1: ${WHY}`, '  moves builds-on INV-12 of inv/SP-1 to now']);
    assert.ok(!r.stdout.includes('moves serves'), `the serves link has no stale-base, so it does not move:\n${show(r)}`);
    one(onLink(check(dir), 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), before, 'stale-base after the dry run');
  });

  test('with --yes: the binding holds the texts of now and judgement J1; the serves binding is as it was; no stale-base; one info judged line; plain al index keeps it', (t) => {
    const dir = staleTarget(t);
    const serves = binding(record(dir, NAME), 'inv/SP-1', 'serves', 'inv/R1');
    const r = judge(dir, 'stale-base', 'inv/SP-1', WHY);
    hasLines(r, [`Added to ${REC}:`, `J1 stale-base inv/SP-1: ${WHY}`, '  moves builds-on INV-12 of inv/SP-1 to now']);
    nextIs(r, 'al check');
    assertEntry(dir, 'J1', 'stale-base', 'inv/SP-1', WHY);
    index(dir);
    const moved = binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12');
    assert.equal(moved.judgement, 'J1', 'the binding names its judgement');
    assert.equal(moved.target_sha256, hashOf(dir, SPEC, 'INV-12'), 'the target hash is the text of now');
    assert.equal(moved.holder_sha256, hashOf(dir, CS, 'SP-1'), 'the holder hash is the text of now');
    assert.deepEqual(binding(record(dir, NAME), 'inv/SP-1', 'serves', 'inv/R1'), serves, 'the serves binding is as it was');
    index(dir);
    assert.deepEqual(binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12'), moved, 'a plain al index does not move it again');
    for (const when of ['in the working tree', 'after a commit']) {
      if (when === 'after a commit') commitAll(dir, 'INV-12 changed, with the judgement J1');
      const c = check(dir);
      none(coded(c, 'stale-base', 'inv/SP-1'), c, `stale-base on inv/SP-1 ${when}`);
      none(coded(c, 'holder-changed', 'inv/SP-1'), c, `holder-changed on inv/SP-1 ${when}`);
      assert.equal(judgedLine(c), `${NAME}/J1 stale-base inv/SP-1: ${WHY}`, show(c));
    }
  });

  test('the target changes again: stale-base comes back and names the judgement as stale', (t) => {
    const dir = staleTarget(t);
    judge(dir, 'stale-base', 'inv/SP-1', WHY);
    commitAll(dir, 'INV-12 changed, with the judgement J1');
    editFile(dir, SPEC, T.INV12b, T.INV12c);
    const r = check(dir);
    namesStale(one(onLink(r, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), r, 'stale-base on inv/SP-1 builds-on INV-12'), r, 1);
    noJudgedLine(r);
  });

  test('the holder changes after the judgement: holder-changed on the judged link names the judgement as stale; on the serves link, no judgement is named', (t) => {
    const dir = staleTarget(t);
    judge(dir, 'stale-base', 'inv/SP-1', WHY);
    commitAll(dir, 'INV-12 changed, with the judgement J1');
    editFile(dir, CS, T.SP1, T.SP1b);
    const r = check(dir);
    namesStale(one(onLink(r, 'holder-changed', 'inv/SP-1', 'builds-on', 'INV-12'), r, 'holder-changed on inv/SP-1 builds-on INV-12'), r, 1);
    namesNoJudgement(one(onLink(r, 'holder-changed', 'inv/SP-1', 'serves', 'inv/R1'), r, 'holder-changed on inv/SP-1 serves inv/R1'), r);
  });

  test('both sides changed: a stale-base judgement also clears holder-changed on the same link, and leaves holder-changed on the other link', (t) => {
    const dir = staleTarget(t);
    editFile(dir, CS, T.SP1, T.SP1b);
    const before = check(dir);
    one(onLink(before, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), before, 'stale-base on the builds-on link');
    one(onLink(before, 'holder-changed', 'inv/SP-1', 'builds-on', 'INV-12'), before, 'holder-changed on the builds-on link');
    one(onLink(before, 'holder-changed', 'inv/SP-1', 'serves', 'inv/R1'), before, 'holder-changed on the serves link');
    const r = judge(dir, 'stale-base', 'inv/SP-1', WHY);
    hasLines(r, [`J1 stale-base inv/SP-1: ${WHY}`, '  moves builds-on INV-12 of inv/SP-1 to now']);
    assert.ok(!r.stdout.includes('moves serves'), show(r));
    const after = check(dir);
    none(onLink(after, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), after, 'stale-base on the builds-on link');
    none(onLink(after, 'holder-changed', 'inv/SP-1', 'builds-on', 'INV-12'), after, 'holder-changed on the builds-on link');
    namesNoJudgement(one(onLink(after, 'holder-changed', 'inv/SP-1', 'serves', 'inv/R1'), after, 'holder-changed on the serves link'), after);
  });
});

// =====================================================================
// holder-changed: a binding whose holder changed

describe('holder-changed: the judgement moves each binding of the holder that has the hint', () => {
  const WHY = 'INV-60 still serves R1 and builds on INV-13.';
  function staleHolder(t) {
    const dir = world(t);
    editFile(dir, SPEC, T.INV60, T.INV60b);
    return dir;
  }

  test('dry run: the J1 line and one "moves" line for each link of INV-60; with --yes both hints go, and both bindings name J1', (t) => {
    const dir = staleHolder(t);
    const before = check(dir);
    one(onLink(before, 'holder-changed', 'INV-60', 'serves', 'inv/R1'), before, 'holder-changed on INV-60 serves inv/R1');
    one(onLink(before, 'holder-changed', 'INV-60', 'builds-on', 'INV-13'), before, 'holder-changed on INV-60 builds-on INV-13');
    const dry = writesNothing(dir, judgementArgs('holder-changed', 'INV-60', WHY, { yes: false }));
    hasLines(dry, [`Would add to ${REC}:`, `J1 holder-changed INV-60: ${WHY}`]);
    hasBlock(dry, `J1 holder-changed INV-60: ${WHY}`, ['  moves serves inv/R1 of INV-60 to now', '  moves builds-on INV-13 of INV-60 to now']);
    const r = judge(dir, 'holder-changed', 'INV-60', WHY);
    hasLines(r, [`Added to ${REC}:`, `J1 holder-changed INV-60: ${WHY}`]);
    hasBlock(r, `J1 holder-changed INV-60: ${WHY}`, ['  moves serves inv/R1 of INV-60 to now', '  moves builds-on INV-13 of INV-60 to now']);
    nextIs(r, 'al check');
    assertEntry(dir, 'J1', 'holder-changed', 'INV-60', WHY);
    index(dir);
    for (const [link, target] of [['serves', 'inv/R1'], ['builds-on', 'INV-13']]) {
      const b = binding(record(dir, NAME), 'INV-60', link, target);
      assert.equal(b.judgement, 'J1', `INV-60 ${link} ${target} names its judgement`);
      assert.equal(b.holder_sha256, hashOf(dir, SPEC, 'INV-60'), `INV-60 ${link} ${target} holds the text of now`);
    }
    const after = check(dir);
    none(coded(after, 'holder-changed', 'INV-60'), after, 'holder-changed on INV-60');
    assert.equal(judgedLine(after), `${NAME}/J1 holder-changed INV-60: ${WHY}`, show(after));
  });

  test('the holder changes again: both hints come back and name the judgement as stale', (t) => {
    const dir = staleHolder(t);
    judge(dir, 'holder-changed', 'INV-60', WHY);
    commitAll(dir, 'INV-60 changed, with the judgement J1');
    editFile(dir, SPEC, T.INV60b, T.INV60c);
    const r = check(dir);
    namesStale(one(onLink(r, 'holder-changed', 'INV-60', 'serves', 'inv/R1'), r, 'holder-changed on INV-60 serves inv/R1'), r, 1);
    namesStale(one(onLink(r, 'holder-changed', 'INV-60', 'builds-on', 'INV-13'), r, 'holder-changed on INV-60 builds-on INV-13'), r, 1);
  });

  test('the target changes after the judgement: stale-base on INV-60 builds-on INV-13 names the judgement as stale', (t) => {
    const dir = staleHolder(t);
    judge(dir, 'holder-changed', 'INV-60', WHY);
    commitAll(dir, 'INV-60 changed, with the judgement J1');
    editFile(dir, SPEC, T.INV13, T.INV13b);
    const r = check(dir);
    namesStale(one(onLink(r, 'stale-base', 'INV-60', 'builds-on', 'INV-13'), r, 'stale-base on INV-60 builds-on INV-13'), r, 1);
  });
});

describe('Bindings of one link in two open records: the judgement moves only the binding in the record of <name>', () => {
  // INV-62 serves inv/R1 and other/R1, so the records of inv and other both
  // hold its bindings. Then INV-13, its target, changes.
  function two(t) {
    const dir = world(t);
    newRequest(dir, 'other', 'The owner wants an invoice view.\n', ['--tier', '2']);
    appendSection(dir, 'other', organized([req('R1', 'Invoice view', 'A user MUST be able to see one invoice.')]));
    write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-62 component serves:inv/R1,other/R1 builds-on:INV-13', 'The viewer shows the lines of an invoice.']])}`);
    index(dir);
    commitAll(dir, 'The request other, and INV-62\n\nTier: 2 — other');
    binding(record(dir, NAME), 'INV-62', 'builds-on', 'INV-13');
    binding(record(dir, 'other'), 'INV-62', 'builds-on', 'INV-13');
    editFile(dir, SPEC, T.INV13, T.INV13b);
    return dir;
  }
  const names = (f, name) => f.msg.includes(`al record ${name} judgement --hint stale-base --on INV-62 --reason <why>`);

  test('before: one stale-base on INV-62 builds-on INV-13 for each record, each naming its own request', (t) => {
    const r = check(two(t));
    const found = onLink(r, 'stale-base', 'INV-62', 'builds-on', 'INV-13');
    assert.equal(found.length, 2, show(r));
    assert.equal(found.filter((f) => names(f, NAME)).length, 1, `one names al record inv judgement:\n${show(r)}`);
    assert.equal(found.filter((f) => names(f, 'other')).length, 1, `one names al record other judgement:\n${show(r)}`);
  });

  test('the judgement in inv: inv\'s hint goes; other\'s hint and other\'s binding stay', (t) => {
    const dir = two(t);
    const kept = binding(record(dir, 'other'), 'INV-62', 'builds-on', 'INV-13');
    judge(dir, 'stale-base', 'INV-62', 'INV-62 still builds on INV-13.');
    assert.equal(binding(record(dir, NAME), 'INV-62', 'builds-on', 'INV-13').judgement, 'J1');
    assert.deepEqual(binding(record(dir, 'other'), 'INV-62', 'builds-on', 'INV-13'), kept, 'the binding in other\'s record is as it was');
    assert.deepEqual(record(dir, 'other').judgements ?? [], [], 'other\'s record holds no judgement');
    const r = check(dir);
    const found = onLink(r, 'stale-base', 'INV-62', 'builds-on', 'INV-13');
    assert.equal(found.length, 1, show(r));
    assert.ok(names(found[0], 'other'), `the hint that stays is other's:\n${show(r)}`);
  });
});

// =====================================================================
// Other hints: the message, the --on paragraph, the paragraphs it names

describe('Any other hint: the judgement keeps its message, the --on paragraph and each paragraph that the message names', () => {
  test('promise-kind on inv/SP-2: the judgement clears it; an edit of SP-2 brings it back as stale', (t) => {
    const dir = world(t);
    const before = check(dir);
    assert.equal(one(coded(before, 'promise-kind', 'inv/SP-2'), before, 'promise-kind on inv/SP-2').msg, 'promise kind? a component paragraph holds MUST', show(before));
    const WHY = 'SP-2 applies R1; it is a design paragraph.';
    const r = judge(dir, 'promise-kind', 'inv/SP-2', WHY);
    hasLines(r, [`Added to ${REC}:`, `J1 promise-kind inv/SP-2: ${WHY}`]);
    assertEntry(dir, 'J1', 'promise-kind', 'inv/SP-2', WHY);
    let c = check(dir);
    none(coded(c, 'promise-kind', 'inv/SP-2'), c, 'promise-kind on inv/SP-2 after the judgement');
    assert.equal(judgedLine(c), `${NAME}/J1 promise-kind inv/SP-2: ${WHY}`, show(c));
    commitAll(dir, 'The judgement J1');
    editFile(dir, CS, T.SP2, T.SP2b);
    c = check(dir);
    namesStale(one(coded(c, 'promise-kind', 'inv/SP-2'), c, 'promise-kind on inv/SP-2 after the edit'), c, 1);
    noJudgedLine(c);
  });

  test('promise-kind on inv/SP-2: a new requirement word changes the message, and the hint comes back as stale', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', 'SP-2 applies R1; it is a design paragraph.');
    editFile(dir, CS, T.SP2, T.SP2s);
    const c = check(dir);
    const f = one(coded(c, 'promise-kind', 'inv/SP-2'), c, 'promise-kind on inv/SP-2 with SHOULD');
    assert.match(f.msg, /SHOULD/, show(c));
    namesStale(f, c, 1);
  });

  test('near-match on inv/SP-3, which names INV-41: an edit of another paragraph keeps it cleared; an edit of INV-41 brings it back as stale', (t) => {
    const dir = world(t);
    const before = check(dir);
    assert.ok(one(coded(before, 'near-match', 'inv/SP-3'), before, 'near-match on inv/SP-3').msg.startsWith('does this change INV-41?'), show(before));
    judge(dir, 'near-match', 'inv/SP-3', 'SP-3 is a new link rule; it does not change INV-41.');
    commitAll(dir, 'The judgement J1');
    editFile(dir, SPEC, T.INV12, T.INV12b);
    let c = check(dir);
    none(coded(c, 'near-match', 'inv/SP-3'), c, 'near-match after an edit of INV-12, which the message does not name');
    editFile(dir, SPEC, T.INV41, T.INV41b);
    c = check(dir);
    namesStale(one(coded(c, 'near-match', 'inv/SP-3'), c, 'near-match on inv/SP-3 after the edit of INV-41'), c, 1);
  });

  test('a hint whose ID is "-" (adr-none): --on is its path, specs/adr; the judgement clears it', (t) => {
    const dir = base(t, { adr: false });
    write(dir, 'specs/adr/README.md', '# Decisions\n\nThe decision records go here.\n');
    newRequest(dir, NAME, 'The owner wants a monthly export.\n', ['--tier', '2']);
    commitAll(dir, 'The request inv\n\nTier: 2 — inv');
    const before = check(dir);
    const f = one(coded(before, 'adr-none'), before, 'adr-none');
    assert.equal(f.id, '-', show(before));
    assert.equal(f.file, 'specs/adr', show(before));
    const WHY = 'The ADRs come with the next change.';
    judge(dir, 'adr-none', 'specs/adr', WHY);
    assertEntry(dir, 'J1', 'adr-none', 'specs/adr', WHY);
    const c = check(dir);
    none(coded(c, 'adr-none'), c, 'adr-none after the judgement');
    assert.equal(judgedLine(c), `${NAME}/J1 adr-none specs/adr: ${WHY}`, show(c));
  });

  test('two current judgements: one grouped info judged line, J1 then J2; the cleared hints\' own lines are gone', (t) => {
    const dir = world(t);
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    judge(dir, 'adr-changed', 'ADR-3', 'Reworded');
    judge(dir, 'promise-kind', 'inv/SP-2', 'A design paragraph');
    assertEntry(dir, 'J2', 'promise-kind', 'inv/SP-2', 'A design paragraph');
    const r = check(dir);
    assert.equal(judgedLine(r), `${NAME}/J1 adr-changed ADR-3: Reworded; ${NAME}/J2 promise-kind inv/SP-2: A design paragraph`, show(r));
    assert.ok(!r.stdout.split('\n').some((l) => l.startsWith('hint adr-changed ') || l.startsWith('hint promise-kind ') && l.includes(' inv/SP-2 ')), show(r));
  });
});


// =====================================================================
// A judgement never clears a not ok (LD-12)

describe('A judgement on a not ok is recorded and shown, and clears nothing', () => {
  // The lines of al conclude that refuse, and its exit code.
  const conclude = (dir) => {
    const r = al(dir, ['conclude', NAME]);
    return { r, code: r.code, refusals: r.stdout.split('\n').filter((l) => l.startsWith('refused') || l.startsWith('al: ')) };
  };

  test('unsigned-requirement inv/R1: the record command says so; al check keeps the not ok and shows the judgement; --strict exits 1; al conclude refuses as before', (t) => {
    const dir = world(t);
    const strict = check(dir, '--strict');
    assert.equal(strict.code, 1, show(strict));
    assert.equal(coded(strict, 'unsigned-requirement', 'inv/R1')[0]?.severity, 'not ok', show(strict));
    const before = conclude(dir);
    assert.notEqual(before.code, 0, show(before.r));
    assert.ok(before.refusals.length > 0, show(before.r));
    const WHY = 'The owner signs R1 tomorrow.';
    const r = judge(dir, 'unsigned-requirement', 'inv/R1', WHY);
    assert.ok(r.stdout.includes('J1 is recorded, but a judgement never clears a not ok: unsigned-requirement clears only by its own fix'), show(r));
    assertEntry(dir, 'J1', 'unsigned-requirement', 'inv/R1', WHY);
    const c = check(dir);
    const found = coded(c, 'unsigned-requirement', 'inv/R1');
    assert.equal(found.length, 1, show(c));
    assert.equal(found[0].severity, 'not ok', show(c));
    assert.ok(found[0].line.includes(` · judgement ${NAME}/J1 is shown; it does not clear a not ok`), show(c));
    noJudgedLine(c);
    const strictAfter = check(dir, '--strict');
    assert.equal(strictAfter.code, 1, `al check --strict still exits 1:\n${show(strictAfter)}`);
    const after = conclude(dir);
    assert.equal(after.code, before.code, show(after.r));
    assert.deepEqual(after.refusals, before.refusals, `al conclude refuses as before:\n${show(after.r)}`);
  });
});

// =====================================================================
// Refusals

describe('The judgement command refuses, and writes nothing, when there is no such hint now or no open request', () => {
  test('--on with no hint of that code on it now: "--on X: al check gives no <code> hint on X now"', (t) => {
    const dir = world(t);
    let r = refused(dir, judgementArgs('adr-changed', 'ADR-3', 'Reworded'));
    assert.ok(r.stdout.includes('--on ADR-3: al check gives no adr-changed hint on ADR-3 now'), show(r));
    r = refused(dir, judgementArgs('promise-kind', 'inv/SP-1', 'A design paragraph'));
    assert.ok(r.stdout.includes('--on inv/SP-1: al check gives no promise-kind hint on inv/SP-1 now'), show(r));
    // INV-60 changed: it has holder-changed, and no stale-base.
    editFile(dir, SPEC, T.INV60, T.INV60b);
    r = refused(dir, judgementArgs('stale-base', 'INV-60', 'Checked'));
    assert.ok(r.stdout.includes('--on INV-60: al check gives no stale-base hint on INV-60 now'), show(r));
    one(onLink(check(dir), 'holder-changed', 'INV-60', 'serves', 'inv/R1'), check(dir), 'holder-changed on INV-60 stays');
  });

  test('a request that does not exist, or that is archived: refused, and the hint stays', (t) => {
    const dir = world(t);
    newRequest(dir, 'old', 'The owner wanted an old thing.\n');
    editRecord(dir, 'old', (rec) => { rec.status = 'concluded'; });
    move(dir, 'requests/old', 'requests/archive/old');
    commitAll(dir, 'An archived request old');
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    refused(dir, judgementArgs('adr-changed', 'ADR-3', 'Reworded', { name: 'nope' }));
    refused(dir, judgementArgs('adr-changed', 'ADR-3', 'Reworded', { name: 'old' }));
    const r = check(dir);
    one(adrChanged(r), r, 'adr-changed on ADR-3 stays');
  });
});

// =====================================================================
// al index --align is removed

describe('al index --align is removed, and says which command replaces it', () => {
  const MESSAGE = 'al: --align is removed: a hint clears by a fix, or by a recorded judgement with its reason';
  for (const id of ['inv/SP-1', 'INV-999']) {
    test(`al index --align ${id}: exit 2, the message, the Next command, nothing written; the stale-base stays`, (t) => {
      const dir = world(t);
      editFile(dir, SPEC, T.INV12, T.INV12b);
      const r = refused(dir, ['index', '--align', id]);
      assert.ok(r.stdout.split('\n').includes(MESSAGE), show(r));
      const next = new RegExp(`^Next {6}al record \\S+ judgement --hint stale-base\\|holder-changed --on ${id.replace('/', '\\/')} --reason <why>$`, 'm');
      assert.match(r.stdout, next, show(r));
      const c = check(dir);
      one(onLink(c, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), c, 'stale-base on inv/SP-1 stays');
    });
  }
});

// =====================================================================
// The words of the hints

describe('The hints name the judgement command, and never al index --align', () => {
  test('stale-base and holder-changed: "then al record inv judgement --hint <code> --on <holder> --reason <why>"; no line names --align', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    editFile(dir, SPEC, T.INV60, T.INV60b);
    const r = check(dir);
    const stale = one(onLink(r, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), r, 'stale-base on inv/SP-1');
    assert.ok(stale.msg.startsWith('builds-on INV-12, which changed since it was bound.'), show(r));
    assert.ok(stale.msg.includes('then al record inv judgement --hint stale-base --on inv/SP-1 --reason <why>'), show(r));
    for (const [link, target] of [['serves', 'inv/R1'], ['builds-on', 'INV-13']]) {
      const f = one(onLink(r, 'holder-changed', 'INV-60', link, target), r, `holder-changed on INV-60 ${link} ${target}`);
      assert.ok(f.msg.includes('then al record inv judgement --hint holder-changed --on INV-60 --reason <why>'), show(r));
    }
    assert.ok(!r.stdout.includes('--align'), `no line names --align:\n${show(r)}`);
  });

  test('stale-base on a requirement target (R1 changed): the same judgement command', (t) => {
    const dir = world(t);
    editRequest(dir, NAME, R1.text, R1b.text);
    const r = check(dir);
    const found = coded(r, 'stale-base', 'inv/SP-1').filter((f) => f.msg.startsWith('inv/R1 changed'));
    const f = one(found, r, 'stale-base on inv/SP-1 for inv/R1');
    assert.ok(f.msg.includes('then al record inv judgement --hint stale-base --on inv/SP-1 --reason <why>'), show(r));
    assert.ok(!r.stdout.includes('--align'), `no line names --align:\n${show(r)}`);
  });

  test('adr-changed: the R1 message, then "; else al record <name> judgement --hint adr-changed --on ADR-3 --reason <why>"', (t) => {
    const dir = world(t);
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    const r = check(dir);
    const f = one(adrChanged(r), r, 'adr-changed on ADR-3');
    assert.ok(f.msg.startsWith(`${R1_MESSAGE('ADR-3')}; else al record `), show(r));
    assert.match(f.msg, /; else al record \S+ judgement --hint adr-changed --on ADR-3 --reason <why>\.?$/, show(r));
    assert.ok(!r.stdout.includes('--align'), show(r));
  });
});

// =====================================================================
// Control: no judgement

describe('Control: with no judgement, each hint shows as today', () => {
  test('stale-base, holder-changed, adr-changed, promise-kind and near-match all show; no info judged line; no line names a judgement', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    editFile(dir, SPEC, T.INV60, T.INV60b);
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    for (const r of [check(dir), (commitAll(dir, 'The edits'), check(dir))]) {
      assert.equal(r.code, 0, show(r));
      assert.ok(one(onLink(r, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), r, 'stale-base').msg
        .startsWith('builds-on INV-12, which changed since it was bound.'), show(r));
      assert.ok(one(onLink(r, 'holder-changed', 'INV-60', 'serves', 'inv/R1'), r, 'holder-changed').msg
        .startsWith('serves inv/R1: this paragraph changed after the link was bound.'), show(r));
      assert.ok(one(adrChanged(r), r, 'adr-changed').msg.startsWith(R1_MESSAGE('ADR-3')), show(r));
      assert.equal(one(coded(r, 'promise-kind', 'inv/SP-2'), r, 'promise-kind').msg, 'promise kind? a component paragraph holds MUST', show(r));
      assert.ok(one(coded(r, 'near-match', 'inv/SP-3'), r, 'near-match').msg.startsWith('does this change INV-41?'), show(r));
      noJudgedLine(r);
      assert.ok(!r.stdout.includes('the judgement '), `no line names a judgement:\n${show(r)}`);
      assert.deepEqual(judgementsOf(dir), [], 'no judgement is recorded');
    }
  });
});
