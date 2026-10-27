// #88, from the review: four cases that the other tests of #88 miss.
// 1. A hint whose ID is "-" (no-id): --on is its path.
//    A no-id judgement holds for the judged paragraph by its text: an edit
//    brings the hint back as stale, a move does not, and a new unmarked
//    paragraph gets its own hint.
// 2. A hint that only `al check --issues` gives (issue-missing): the
//    judgement takes --issues too.
// 3. A judgement on a `changes` link keeps what the link changes: the map
//    fact and al conclude stay as they were, because the version that the
//    link changes is not moved to now. A builds-on link still moves.
// 4. Two accepted files of ADR-3: a judgement on ADR-3 holds for each file
//    by its own text.
// Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings } from './helpers/invoicer.js';
import {
  ADR3, al, appendSection, binding, commitAll, doc, editFile, editRecord, git, hashOf, index, newRequest, ok, organized,
  read, record, refused, show, write, writeYaml,
} from './helpers/project.js';
import {
  CS, NAME, R1, SPEC, T, base, check, coded, judge, judgedLine, judgedLines, namesStale, none, onLink, one, world,
} from './helpers/judgement-88.js';
import { base7, entry } from './helpers/map-68.js';

const WHY = 'Checked it by hand.';
const out = (r) => r.stdout.split('\n');
const has = (r, line) => assert.ok(out(r).includes(line), `the line "${line}":\n${show(r)}`);

// =====================================================================

describe('a hint whose ID is "-": --on is its path', () => {
  test('no-id on specs/invoices.md: the judgement --on specs/invoices.md is recorded; al check then gives no no-id on that file and shows it in "info judged"', (t) => {
    const dir = world(t);
    write(dir, SPEC, `${read(dir, SPEC)}\nA stray paragraph with no marker.\n`);
    let r = check(dir);
    const f = one(coded(r, 'no-id').filter((x) => x.file.split(':')[0] === SPEC), r, `no-id on ${SPEC}`);
    assert.equal(f.id, '-', `the hint line shows the ID "-":\n${f.line}`);

    const j = judge(dir, 'no-id', SPEC, WHY);
    has(j, `J1 no-id ${SPEC}: ${WHY}`);
    r = check(dir);
    none(coded(r, 'no-id').filter((x) => x.file.split(':')[0] === SPEC), r, `no-id on ${SPEC} after the judgement`);
    assert.ok(judgedLine(r).includes(`${NAME}/J1 no-id ${SPEC}: ${WHY}`), show(r));
  });

  // The world above, with the judgement J1 on the no-id hint of the
  // unmarked paragraph at the end of specs/invoices.md (after INV-60).
  const STRAY = 'A stray paragraph with no marker.';
  const INV12 = `<!-- INV-12 data -->\n\n${T.INV12}\n`;
  const noIds = (r) => coded(r, 'no-id').filter((x) => x.file.split(':')[0] === SPEC);
  function judged(t) {
    const dir = world(t);
    write(dir, SPEC, `${read(dir, SPEC)}\n${STRAY}\n`);
    one(noIds(check(dir)), check(dir), `no-id on ${SPEC}`);
    judge(dir, 'no-id', SPEC, WHY);
    none(noIds(check(dir)), check(dir), `no-id on ${SPEC} after the judgement`);
    return dir;
  }

  test('no-id: an edit of the judged unmarked paragraph brings the hint back, and it names the judgement inv/J1 as stale', (t) => {
    const dir = judged(t);
    editFile(dir, SPEC, STRAY, 'A stray paragraph with no marker, edited.');
    const r = check(dir);
    namesStale(one(noIds(r), r, `no-id on ${SPEC} after the edit`), r, 1);
  });

  test('no-id: a second unmarked paragraph added after the judgement (after INV-12) gives its own no-id hint, which is not cleared; the judged one stays cleared', (t) => {
    const dir = judged(t);
    editFile(dir, SPEC, INV12, `${INV12}\nA second stray paragraph.\n`);
    const r = check(dir);
    const f = one(noIds(r), r, `one no-id on ${SPEC}: the new paragraph's`);
    assert.ok(f.msg.startsWith('a paragraph with no ID marker, after INV-12'), `the hint is on the new paragraph, after INV-12:\n${f.line}\n${show(r)}`);
  });

  test('no-id: a move of the judged unmarked paragraph (from after INV-60 to after INV-12), its text kept, keeps it cleared', (t) => {
    const dir = judged(t);
    editFile(dir, SPEC, `\n${STRAY}\n`, '');
    editFile(dir, SPEC, INV12, `${INV12}\n${STRAY}\n`);
    const r = check(dir);
    none(noIds(r), r, `no-id on ${SPEC} after the move`);
    assert.ok(judgedLine(r).includes(`${NAME}/J1 no-id ${SPEC}: ${WHY}`), show(r));
  });
});

// =====================================================================

describe('two accepted ADR files with one number: a judgement on ADR-3 holds for each file by its own text', () => {
  // main: two accepted files of ADR-3, then the branch feature with the
  // open request inv. The texts: a, then b, then c.
  const A = 'specs/adr/0003-a.md';
  const B = 'specs/adr/3-b.md';
  const TB = 'Context: a link must be signed.';
  const TBb = 'Context: a link must be signed by the server.';
  const TBc = 'Context: a link must be signed by the server only.';
  const TEXT = { [A]: [T.ADR, T.ADRb, T.ADRc], [B]: [TB, TBb, TBc] };
  function twoFiles(t) {
    const dir = base(t, { adr: false });
    git(dir, 'checkout', '-q', 'main');
    write(dir, A, ADR3);
    write(dir, B, `Status: accepted\n\n${doc([['ADR-3 choice', '# ADR-3: Signed links, part two'], ['ADR-3-1 rationale', TB]])}`);
    commitAll(dir, 'two files of ADR-3');
    git(dir, 'checkout', '-q', 'feature');
    git(dir, 'merge', '-q', '--ff-only', 'main');
    newRequest(dir, NAME, 'The owner wants signed links.\n', ['--tier', '2']);
    commitAll(dir, `The request ${NAME}\n\nTier: 2 — ${NAME}`);
    return dir;
  }
  const at = (r, file) => coded(r, 'adr-changed', 'ADR-3').filter((f) => f.file.split(':')[0] === file);
  const rewrite = (dir, file, from, to) => editFile(dir, file, TEXT[file][from], TEXT[file][to]);
  const listsJ1 = (r) => judgedLines(r).some((f) => f.msg.includes(`${NAME}/J1 `));

  test('only the second file is rewritten: adr-changed on ADR-3 at 3-b.md; the judgement clears it; a second edit of 3-b.md brings it back, names inv/J1 as stale, and "info judged" no longer lists J1', (t) => {
    const dir = twoFiles(t);
    rewrite(dir, B, 0, 1);
    let r = check(dir);
    one(at(r, B), r, `adr-changed at ${B}`);
    none(at(r, A), r, `adr-changed at ${A}`);
    judge(dir, 'adr-changed', 'ADR-3', WHY);
    r = check(dir);
    none(coded(r, 'adr-changed', 'ADR-3'), r, 'adr-changed on ADR-3 after the judgement');
    assert.ok(listsJ1(r), `info judged lists J1:\n${show(r)}`);

    rewrite(dir, B, 1, 2);
    r = check(dir);
    namesStale(one(at(r, B), r, `adr-changed at ${B} after the second edit`), r, 1);
    none(at(r, A), r, `adr-changed at ${A} after the second edit`);
    assert.ok(!listsJ1(r), `info judged no longer lists J1:\n${show(r)}`);
  });

  for (const [again, other] of [[A, B], [B, A]]) {
    test(`control: both files are rewritten; one judgement on ADR-3 clears both hints; a second edit of ${again.split('/').pop()} brings back the hint at that file only`, (t) => {
      const dir = twoFiles(t);
      rewrite(dir, A, 0, 1);
      rewrite(dir, B, 0, 1);
      let r = check(dir);
      one(at(r, A), r, `adr-changed at ${A}`);
      one(at(r, B), r, `adr-changed at ${B}`);
      judge(dir, 'adr-changed', 'ADR-3', WHY);
      r = check(dir);
      none(coded(r, 'adr-changed', 'ADR-3'), r, 'adr-changed on ADR-3 after the judgement');

      rewrite(dir, again, 1, 2);
      r = check(dir);
      namesStale(one(at(r, again), r, `adr-changed at ${again} after its second edit`), r, 1);
      none(at(r, other), r, `adr-changed at ${other}, which did not change again`);
    });
  }
});

// =====================================================================

describe('a hint that only al check --issues gives: the judgement takes --issues', () => {
  // A repo with origin acme/invoicer and the items folder beside it. The
  // request inv has the task T1 for #5 (in the folder) and T2 for #7 (not
  // in the folder): al check --issues gives issue-missing on inv/T2.
  const FOLDER = '../items';
  const ISSUES = ['--issues', FOLDER];
  function items(t) {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-88-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const dir = join(root, 'invoicer');
    const folder = join(root, 'items');
    mkdirSync(dir);
    mkdirSync(folder);
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.name', 'Fixture Author');
    git(dir, 'config', 'user.email', 'author@example.invalid');
    git(dir, 'config', 'commit.gpgsign', 'false');
    git(dir, 'remote', 'add', 'origin', 'git@github.com:acme/invoicer.git');
    writeYaml(dir, '.assuredloop/config.yaml', { docs: [{ file: SPEC, prefix: 'INV' }] });
    write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 rule', 'An invoice MUST have at least one line.']]));
    commitAll(dir, 'base');
    git(dir, 'checkout', '-q', '-b', 'feature');
    write(folder, 'invoicer-5.json', `${JSON.stringify({ body: 'Build the export.\n', comments: [], number: 5, parent: null, state: 'OPEN', url: 'https://github.com/acme/invoicer/issues/5' }, null, 2)}\n`);
    ok(dir, ['new', NAME, '--from', '-'], { input: 'The owner wants the monthly export.\n' });
    editRecord(dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: '#5' }, { id: 'T2', ref: '#7' }]; });
    ok(dir, ['index', ...ISSUES]);
    commitAll(dir, 'name the items');
    return dir;
  }
  const checkIssues = (dir) => {
    const r = al(dir, ['check', ...ISSUES]);
    return { ...r, findings: findings(r.stdout) };
  };
  const args = (extra) => ['record', NAME, 'judgement', '--hint', 'issue-missing', '--on', `${NAME}/T2`, '--reason', WHY, ...extra, '--yes'];

  test('issue-missing on inv/T2: without --issues the judgement is refused as "no issue-missing hint"; with --issues it is recorded, and al check --issues clears it', (t) => {
    const dir = items(t);
    let r = checkIssues(dir);
    one(coded(r, 'issue-missing', `${NAME}/T2`), r, 'issue-missing on inv/T2');

    const no = refused(dir, args([]));
    assert.match(no.stdout, /al check gives no issue-missing hint on inv\/T2 now/, show(no));

    const j = ok(dir, args(ISSUES));
    has(j, `J1 issue-missing ${NAME}/T2: ${WHY}`);
    r = checkIssues(dir);
    none(coded(r, 'issue-missing', `${NAME}/T2`), r, 'issue-missing on inv/T2 after the judgement');
    assert.ok(judgedLine(r).includes(`${NAME}/J1 issue-missing ${NAME}/T2: ${WHY}`), show(r));
  });
});

// =====================================================================

describe('a judgement on a changes link keeps what the link changes', () => {
  // The change spec of inv: SP-1 data serves:R1 changes:INV-12
  // builds-on:INV-13. Indexed and committed, so the bindings hold the texts
  // of then. With `onMain`, all of it is on main, then the branch feature.
  const SP1 = 'The invoice number is unique in the shop.';
  const SP1b = 'The invoice number is unique in the whole shop.';
  const INV12d = 'An invoice has a unique number, one customer, lines, a total and a due date.';
  function changes(t, { onMain = false } = {}) {
    const dir = base(t, { adr: false });
    if (onMain) git(dir, 'checkout', '-q', 'main');
    newRequest(dir, NAME, 'The owner wants unique invoice numbers.\n', ['--tier', '2']);
    appendSection(dir, NAME, organized([R1]));
    write(dir, CS, doc([['SP-1 data serves:R1 changes:INV-12 builds-on:INV-13', SP1]]));
    index(dir);
    commitAll(dir, `The request ${NAME}\n\nTier: 2 — ${NAME}`);
    if (onMain) {
      git(dir, 'branch', '-q', '-D', 'feature');
      git(dir, 'checkout', '-q', '-b', 'feature');
    }
    return dir;
  }
  const H = `${NAME}/SP-1`;
  const changesOf = (dir) => binding(record(dir, NAME), H, 'changes', 'INV-12');
  const fact = (r) => entry(r, 'link', `${H} changes INV-12`).fact;
  const refusals = (dir) => {
    const r = al(dir, ['conclude', NAME]);
    return { r, lines: out(r).filter((l) => l.startsWith('refused: ')) };
  };
  // al conclude gives no refusal for SP-1's changes link, and no refusal
  // that it did not give before the judgement.
  function concludeKeeps(dir, before) {
    const after = refusals(dir);
    const unchanged = `refused: ${H} changes INV-12, and INV-12 is unchanged since the link`;
    assert.deepEqual(after.lines.filter((l) => l.startsWith(unchanged)), [], `no "${unchanged}":\n${show(after.r)}`);
    assert.deepEqual(after.lines.filter((l) => l.startsWith(`refused: ${H} changes INV-12`)), [], `no refusal on ${H} changes INV-12:\n${show(after.r)}`);
    assert.deepEqual(after.lines.filter((l) => !before.lines.includes(l)), [], `no new refusal:\n--- before\n${show(before.r)}\n--- after\n${show(after.r)}`);
  }

  test('holder-changed on inv/SP-1, whose target INV-12 the branch changed: the holder moves to now, the target version stays; the map still says "changed since the link"; al conclude gives no new refusal', (t) => {
    const dir = changes(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    index(dir);
    commitAll(dir, `${NAME}: INV-12 gets a unique number`);
    let r = check(dir);
    assert.equal(fact(r), 'changed since the link', show(r));
    const before = refusals(dir);
    const was = changesOf(dir);

    editFile(dir, CS, SP1, SP1b);
    r = check(dir);
    one(onLink(r, 'holder-changed', H, 'changes', 'INV-12'), r, 'holder-changed on inv/SP-1 changes INV-12');
    const j = judge(dir, 'holder-changed', H, WHY);
    has(j, `  moves changes INV-12 of ${H} to now`);

    const now = changesOf(dir);
    assert.notEqual(now.holder_sha256, was.holder_sha256, `the holder moves to now:\n${JSON.stringify(now)}`);
    assert.equal(now.target_sha256, was.target_sha256, `target_sha256 keeps the version that the link changes:\n${JSON.stringify(now)}`);
    r = check(dir);
    none(onLink(r, 'holder-changed', H, 'changes', 'INV-12'), r, 'holder-changed on inv/SP-1 changes INV-12 after the judgement');
    assert.equal(fact(r), 'changed since the link', `the map fact stays:\n${show(r)}`);
    concludeKeeps(dir, before);
  });

  test('stale-base on inv/SP-1 changes INV-12 from other work: the judgement clears it; the binding keeps target_sha256 and gets judged_target_sha256 of now; the map fact stays; a later change brings it back as stale', (t) => {
    const dir = changes(t);
    // Part 1 of inv changes INV-12 and merges; then other work on main
    // changes INV-12 again; then the branch feature-2 of inv.
    editFile(dir, SPEC, T.INV12, T.INV12b);
    commitAll(dir, `${NAME}: INV-12 gets a unique number`);
    index(dir);
    commitAll(dir, `${NAME}: records`);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${NAME} part 1`, 'feature');
    editFile(dir, SPEC, T.INV12b, T.INV12c);
    index(dir);
    commitAll(dir, 'other work: one customer');
    git(dir, 'checkout', '-q', '-b', 'feature-2');
    write(dir, 'src/number.js', 'export const unique = true;\n');
    commitAll(dir, `${NAME}: part 2`);

    let r = check(dir);
    one(onLink(r, 'stale-base', H, 'changes', 'INV-12'), r, 'stale-base on inv/SP-1 changes INV-12');
    assert.equal(fact(r), 'changed since the link', show(r));
    const before = refusals(dir);
    const was = changesOf(dir);

    judge(dir, 'stale-base', H, WHY);
    const now = changesOf(dir);
    assert.equal(now.target_sha256, was.target_sha256, `target_sha256 keeps the version that the link changes:\n${JSON.stringify(now)}`);
    assert.equal(now.judged_target_sha256, hashOf(dir, SPEC, 'INV-12'), `judged_target_sha256 is the version of INV-12 now:\n${JSON.stringify(now)}`);
    r = check(dir);
    none(onLink(r, 'stale-base', H, 'changes', 'INV-12'), r, 'stale-base on inv/SP-1 changes INV-12 after the judgement');
    assert.equal(fact(r), 'changed since the link', `the map fact stays:\n${show(r)}`);
    concludeKeeps(dir, before);

    // The judgement merges with part 2; other work changes INV-12 again;
    // then the branch feature-3 of inv.
    commitAll(dir, `${NAME}: J1`);
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '-m', `Merge ${NAME} part 2`, 'feature-2');
    editFile(dir, SPEC, T.INV12c, INV12d);
    index(dir);
    commitAll(dir, 'other work: a due date');
    git(dir, 'checkout', '-q', '-b', 'feature-3');
    r = check(dir);
    namesStale(one(onLink(r, 'stale-base', H, 'changes', 'INV-12'), r, 'stale-base on inv/SP-1 changes INV-12 again'), r, 1);
  });

  test('binding-unknown on inv/SP-1 changes INV-12, whose target is at the base and which the branch changed: the binding takes the text at the base; the map still says "changed since the link"; al conclude gives no refusal on it', (t) => {
    const dir = changes(t, { onMain: true });
    const atBase = hashOf(dir, SPEC, 'INV-12');
    editRecord(dir, NAME, (rec) => { rec.bindings = rec.bindings.filter((b) => !(b.holder === H && b.link === 'changes')); });
    commitAll(dir, `${NAME}: the changes binding is lost`);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    let r = check(dir);
    assert.ok(out(r).some((l) => l.startsWith('index binding unknown: ') && l.includes(`${H} changes INV-12`)), `binding unknown on ${H} changes INV-12:\n${show(r)}`);
    const before = refusals(dir);

    const j = judge(dir, 'binding-unknown', H, WHY);
    has(j, `  binds changes INV-12 of ${H} to INV-12's text at the base ${base7(dir)}`);
    const now = changesOf(dir);
    assert.equal(now.target_sha256, atBase, `target_sha256 is the text of INV-12 at the base:\n${JSON.stringify(now)}`);
    r = check(dir);
    assert.equal(fact(r), 'changed since the link', `the map says the branch changed INV-12:\n${show(r)}`);
    concludeKeeps(dir, before);
  });

  test('control: holder-changed on inv/SP-1 still moves both sides of its builds-on link to now', (t) => {
    const dir = changes(t);
    editFile(dir, SPEC, T.INV13, T.INV13b);
    index(dir);
    commitAll(dir, `${NAME}: INV-13 names the amount`);
    const was = binding(record(dir, NAME), H, 'builds-on', 'INV-13');
    editFile(dir, CS, SP1, SP1b);
    const r = check(dir);
    one(onLink(r, 'holder-changed', H, 'builds-on', 'INV-13'), r, 'holder-changed on inv/SP-1 builds-on INV-13');
    const j = judge(dir, 'holder-changed', H, WHY);
    has(j, `  moves builds-on INV-13 of ${H} to now`);
    const now = binding(record(dir, NAME), H, 'builds-on', 'INV-13');
    assert.notEqual(now.holder_sha256, was.holder_sha256, `the holder moves to now:\n${JSON.stringify(now)}`);
    assert.equal(now.target_sha256, hashOf(dir, SPEC, 'INV-13'), `the target moves to now:\n${JSON.stringify(now)}`);
    assert.equal(now.holder_sha256, changesOf(dir).holder_sha256, 'the holder versions of the two links agree');
  });
});
