// #88, from the review: three cases that the other tests of #88 miss.
// 1. A hint whose ID is "-" (no-id): --on is its path.
// 2. A hint that only `al check --issues` gives (issue-missing): the
//    judgement takes --issues too.
// 3. A judgement on a `changes` link keeps what the link changes: the map
//    fact and al conclude stay as they were, because the version that the
//    link changes is not moved to now. A builds-on link still moves.
// Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings } from './helpers/invoicer.js';
import {
  al, appendSection, binding, commitAll, doc, editFile, editRecord, git, hashOf, index, newRequest, ok, organized, read,
  record, refused, show, write, writeYaml,
} from './helpers/project.js';
import {
  CS, NAME, R1, SPEC, T, base, check, coded, judge, judgedLine, namesStale, none, onLink, one, world,
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
