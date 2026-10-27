// #88, part 2: an edit that changes only an ID, or moves a paragraph, gives
// no hint (LD-12), also for the hints that compare hashes; and the old
// records (bindings that `al index --align` moved, issue-changed judgements)
// stay readable and keep their meaning. The worlds are those of
// judgement-88.test.js. Nothing here reads the code under test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findings, minus } from './helpers/invoicer.js';
import {
  al, binding, commitAll, doc, editFile, editRecord, git, hashOf, index, ok, read, record, refused, sha, show, write,
  writeYaml,
} from './helpers/project.js';
import {
  ADR3_FILE, CS, MORE, NAME, SPEC, T, check, coded, judge, judgedLine, namesNoJudgement, noJudgedLine, none, onLink, one,
  world,
} from './helpers/judgement-88.js';

const BINDING_HINTS = ['holder-changed', 'stale-base'];
const noBindingHint = (r) => none(r.findings.filter((f) => BINDING_HINTS.includes(f.code)), r, 'holder-changed or stale-base');

// A paragraph as the world writes it: its marker line, a blank line, its text.
const para = (marker, text) => `<!-- ${marker} -->\n\n${text}\n`;
// Takes a paragraph out of a file (with the blank line after it, or before
// it when it is the last one) and returns it.
function cut(dir, file, block) {
  const text = read(dir, file);
  const whole = text.endsWith(`\n\n${block}`) ? `\n\n${block}` : `${block}\n`;
  assert.equal(text.split(whole).length, 2, `${file} holds the paragraph once:\n${block}`);
  write(dir, file, text.endsWith(whole) && whole.startsWith('\n') ? `${text.slice(0, -whole.length)}\n` : text.replace(whole, ''));
  return block;
}
const append = (dir, file, block) => {
  const text = read(dir, file);
  write(dir, file, `${text.endsWith('\n') ? text : `${text}\n`}\n${block}`);
};

// Each finding of `after` is one of `before` (by severity, code and ID).
function addsNothing(before, after, what) {
  assert.deepEqual(minus(after.findings, before.findings), [], `${what} adds no finding:\n--- before\n${show(before)}\n--- after\n${show(after)}`);
}

const INV12 = para('INV-12 data', T.INV12);
const INV13 = para('INV-13 rule', T.INV13);
const INV41 = para('INV-41 rule', T.INV41);
const INV60 = para('INV-60 component serves:inv/R1 builds-on:INV-13', T.INV60);
const SP2 = para('SP-2 component serves:R1', T.SP2);

// =====================================================================

describe('LD-12: a move gives no hint', () => {
  test('two paragraphs of specs/invoices.md swap places (INV-12, the target of inv/SP-1, and INV-13, the target of INV-60): no new finding', (t) => {
    const dir = world(t);
    const before = check(dir);
    const text = read(dir, SPEC);
    write(dir, SPEC, text.replace(`${INV12}\n${INV13}`, `${INV13}\n${INV12}`));
    assert.notEqual(read(dir, SPEC), text, 'the paragraphs moved');
    const after = check(dir);
    addsNothing(before, after, 'the swap');
    noBindingHint(after);
  });

  test('a target moves to another spec doc (INV-12 to specs/more.md): no new finding', (t) => {
    const dir = world(t);
    const before = check(dir);
    append(dir, MORE, cut(dir, SPEC, INV12));
    const after = check(dir);
    addsNothing(before, after, 'the move of INV-12');
    noBindingHint(after);
  });

  test('a holder moves to another spec doc (INV-60 to specs/more.md): no new finding', (t) => {
    const dir = world(t);
    const before = check(dir);
    append(dir, MORE, cut(dir, SPEC, INV60));
    const after = check(dir);
    addsNothing(before, after, 'the move of INV-60');
    noBindingHint(after);
  });

  test('a paragraph of the change spec moves (SP-2 after SP-3): no new finding', (t) => {
    const dir = world(t);
    const before = check(dir);
    append(dir, CS, cut(dir, CS, SP2));
    const after = check(dir);
    addsNothing(before, after, 'the move of SP-2');
  });

  test('an accepted ADR\'s file is renamed (ADR-3, same number): no new finding, and no adr-changed', (t) => {
    const dir = world(t);
    const before = check(dir);
    git(dir, 'mv', ADR3_FILE, 'specs/adr/0003-signed-urls.md');
    const after = check(dir);
    addsNothing(before, after, 'the rename of the ADR file');
    none(coded(after, 'adr-changed'), after, 'adr-changed');
  });
});

describe('LD-12: a move after a judgement keeps the judgement current', () => {
  test('adr-changed J1 on ADR-3, then its file is renamed: no adr-changed, and J1 is still shown', (t) => {
    const dir = world(t);
    editFile(dir, ADR3_FILE, T.ADR, T.ADRb);
    judge(dir, 'adr-changed', 'ADR-3', 'Reworded');
    git(dir, 'mv', ADR3_FILE, 'specs/adr/0003-signed-urls.md');
    const r = check(dir);
    none(coded(r, 'adr-changed'), r, 'adr-changed');
    assert.equal(judgedLine(r), `${NAME}/J1 adr-changed ADR-3: Reworded`, show(r));
  });

  test('promise-kind J1 on inv/SP-2, then SP-2 moves after SP-3: no promise-kind on it', (t) => {
    const dir = world(t);
    judge(dir, 'promise-kind', 'inv/SP-2', 'A design paragraph');
    append(dir, CS, cut(dir, CS, SP2));
    const r = check(dir);
    none(coded(r, 'promise-kind', 'inv/SP-2'), r, 'promise-kind on inv/SP-2');
    assert.equal(judgedLine(r), `${NAME}/J1 promise-kind inv/SP-2: A design paragraph`, show(r));
  });

  test('near-match J1 on inv/SP-3, then INV-41, which its message names, moves to specs/more.md: no near-match', (t) => {
    const dir = world(t);
    judge(dir, 'near-match', 'inv/SP-3', 'A new rule');
    append(dir, MORE, cut(dir, SPEC, INV41));
    const r = check(dir);
    none(coded(r, 'near-match', 'inv/SP-3'), r, 'near-match on inv/SP-3');
  });

  test('stale-base J1 on inv/SP-1, then its target INV-12 moves to specs/more.md: no stale-base and no holder-changed on inv/SP-1', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    judge(dir, 'stale-base', 'inv/SP-1', 'Checked');
    append(dir, MORE, cut(dir, SPEC, para('INV-12 data', T.INV12b)));
    const r = check(dir);
    none(coded(r, 'stale-base', 'inv/SP-1'), r, 'stale-base on inv/SP-1');
    none(coded(r, 'holder-changed', 'inv/SP-1'), r, 'holder-changed on inv/SP-1');
  });

  test('holder-changed J1 on INV-60, then INV-60 moves to specs/more.md: no holder-changed on it', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, T.INV60, T.INV60b);
    judge(dir, 'holder-changed', 'INV-60', 'Checked');
    append(dir, MORE, cut(dir, SPEC, para('INV-60 component serves:inv/R1 builds-on:INV-13', T.INV60b)));
    const r = check(dir);
    none(coded(r, 'holder-changed', 'INV-60'), r, 'holder-changed on INV-60');
    none(coded(r, 'stale-base', 'INV-60'), r, 'stale-base on INV-60');
  });
});

describe('LD-12: an edit that changes only an ID gives no hint from the text hash', () => {
  // lost-id and unresolved-link may still show where an old ID is named;
  // these tests do not ask about them.
  test('a holder\'s ID changes (INV-60 to INV-63), its links and text kept: no holder-changed and no stale-base', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, '<!-- INV-60 component', '<!-- INV-63 component');
    for (const when of ['before al index', 'after al index']) {
      if (when === 'after al index') index(dir);
      noBindingHint(check(dir));
    }
  });

  test('a target\'s ID changes (INV-12 to INV-14) and the holder\'s marker names the new ID: no holder-changed and no stale-base', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, '<!-- INV-12 data -->', '<!-- INV-14 data -->');
    editFile(dir, CS, 'builds-on:INV-12', 'builds-on:INV-14');
    for (const when of ['before al index', 'after al index']) {
      if (when === 'after al index') index(dir);
      noBindingHint(check(dir));
    }
  });

  test('a target\'s ID changes (INV-12 to INV-14) and the holder still names INV-12: no holder-changed and no stale-base', (t) => {
    const dir = world(t);
    editFile(dir, SPEC, '<!-- INV-12 data -->', '<!-- INV-14 data -->');
    noBindingHint(check(dir));
  });
});

// =====================================================================
// Old records

describe('Old records: a binding that al index --align moved, with no judgement: field, keeps its meaning', () => {
  // As the old --align left it: INV-12 changed, and the binding of inv/SP-1
  // builds-on INV-12 holds the hashes of now, with no judgement: field.
  function aligned(t) {
    const dir = world(t);
    editFile(dir, SPEC, T.INV12, T.INV12b);
    index(dir);
    const now = { holder: hashOf(dir, CS, 'SP-1'), target: hashOf(dir, SPEC, 'INV-12') };
    editRecord(dir, NAME, (rec) => {
      const b = rec.bindings.find((x) => x.holder === 'inv/SP-1' && x.link === 'builds-on' && x.target === 'INV-12');
      b.holder_sha256 = now.holder;
      b.target_sha256 = now.target;
    });
    commitAll(dir, 'INV-12 changed; SP-1 aligned');
    return dir;
  }

  test('al check reads it: no stale-base on inv/SP-1, no info judged line; al index keeps it as it is', (t) => {
    const dir = aligned(t);
    const before = binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12');
    assert.equal(before.judgement, undefined);
    const r = check(dir);
    assert.equal(r.code, 0, show(r));
    assert.doesNotMatch(r.stdout, /^al: /m, show(r));
    none(coded(r, 'record-unreadable'), r, 'record-unreadable');
    none(coded(r, 'stale-base', 'inv/SP-1'), r, 'stale-base on inv/SP-1');
    noJudgedLine(r);
    index(dir);
    assert.deepEqual(binding(record(dir, NAME), 'inv/SP-1', 'builds-on', 'INV-12'), before);
  });

  test('its target changes again: stale-base with the new words, and it names no judgement', (t) => {
    const dir = aligned(t);
    editFile(dir, SPEC, T.INV12b, T.INV12c);
    const r = check(dir);
    const f = one(onLink(r, 'stale-base', 'inv/SP-1', 'builds-on', 'INV-12'), r, 'stale-base on inv/SP-1 builds-on INV-12');
    assert.ok(f.msg.includes('then al record inv judgement --hint stale-base --on inv/SP-1 --reason <why>'), show(r));
    namesNoJudgement(f, r);
  });
});

describe('issue-changed keeps its form and its meaning; an old issue-changed judgement stays readable', () => {
  // A repo with origin acme/invoicer, and the items folder beside it. The
  // request inv has the task T1 for #5; al index --issues keeps its text.
  const FOLDER = '../items';
  const ISSUES = ['--issues', FOLDER];
  const item = (body) => `${JSON.stringify({ body, comments: [], number: 5, parent: null, state: 'OPEN', url: 'https://github.com/acme/invoicer/issues/5' }, null, 2)}\n`;
  const BODY = 'Build the export.\n';
  const BODYb = 'Build the export as JSON.\n';
  const BODYc = 'Build the export as JSON and CSV.\n';
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
    write(folder, 'invoicer-5.json', item(BODY));
    ok(dir, ['new', NAME, '--from', '-'], { input: 'The owner wants the monthly export.\n' });
    editRecord(dir, NAME, (rec) => { rec.tasks = [{ id: 'T1', ref: '#5' }]; });
    ok(dir, ['index', ...ISSUES]);
    commitAll(dir, 'name the item');
    return { dir, folder };
  }
  const checkIssues = (dir) => {
    const r = al(dir, ['check', ...ISSUES]);
    return { ...r, findings: findings(r.stdout) };
  };

  test('the judgement with --issues clears the hint, which comes back with "changed since the judgement J1"; without --issues it is refused', (t) => {
    const w = items(t);
    write(w.folder, 'invoicer-5.json', item(BODYb));
    let r = checkIssues(w.dir);
    one(coded(r, 'issue-changed'), r, 'issue-changed');
    refused(w.dir, ['record', NAME, 'judgement', '--hint', 'issue-changed', '--on', '#5', '--reason', 'Read it.', '--yes']);
    const j = ok(w.dir, ['record', NAME, 'judgement', '--hint', 'issue-changed', '--on', '#5', '--reason', 'Read it.', ...ISSUES, '--yes']);
    assert.ok(j.stdout.split('\n').includes('J1 issue-changed acme/invoicer#5: Read it.'), show(j));
    r = checkIssues(w.dir);
    none(coded(r, 'issue-changed'), r, 'issue-changed after the judgement');
    write(w.folder, 'invoicer-5.json', item(BODYc));
    r = checkIssues(w.dir);
    assert.ok(one(coded(r, 'issue-changed'), r, 'issue-changed').msg.startsWith('changed since the judgement J1 '), show(r));
  });

  test('an issue-changed judgement written by hand as the old al wrote it: it clears the hint; a later change brings the old "changed since the judgement J1"', (t) => {
    const w = items(t);
    write(w.folder, 'invoicer-5.json', item(BODYb));
    editRecord(w.dir, NAME, (rec) => {
      rec.judgements = [{
        id: 'J1', hint: 'issue-changed', on: 'acme/invoicer#5', at: 'named', reason: 'Read it.',
        sha256: sha(JSON.stringify([BODYb])), recorded: '2026-05-04T09:30Z',
      }];
    });
    commitAll(w.dir, 'An old judgement');
    let r = checkIssues(w.dir);
    assert.equal(r.code, 0, show(r));
    none(coded(r, 'record-unreadable'), r, 'record-unreadable');
    none(coded(r, 'issue-changed'), r, 'issue-changed with the old judgement');
    write(w.folder, 'invoicer-5.json', item(BODYc));
    r = checkIssues(w.dir);
    assert.ok(one(coded(r, 'issue-changed'), r, 'issue-changed').msg.startsWith('changed since the judgement J1 '), show(r));
  });
});
