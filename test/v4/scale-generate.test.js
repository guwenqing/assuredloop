// scale/generate.js (#188, T15; interface.md "scale/generate.js"): the
// refusals, the repos and their branch state, world.json, determinism, the
// central repo's layout and records, the exact v4 format, kept history, the
// removed IDs, the change spec sizes and the output repos.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  DESIGN_KINDS, FULL, PROMISE_KINDS, PR_MERGE, REPO, al, exportAt, firstParentMerges, generate, git, linesOf, listDir, makeWorld,
  markerIds, readYamlFile,
  removeDir, repoState, show, specIdsAt, tempDir, tryGit,
} from './helpers/scale.js';

// The small world most tests read: 6 requests, 2 open, 2 output repos.
const OPTS = { requests: 6, outputs: 2, paragraphs: 6, open: 2 };

// --- refusals: exit 2, a `generate: ` line on stderr, nothing written

describe('generate.js refusals', () => {
  let top;
  before(() => { top = tempDir(); });
  after(() => removeDir(top));

  const refused = (r) => {
    assert.equal(r.code, 2, show(r));
    assert.match(r.stderr, /^generate: /m, show(r));
  };

  test('no --out: exit 2, a generate: line, nothing written', () => {
    const before = listDir(top);
    refused(generate(['--requests', '2', '--outputs', '0'], { cwd: top }));
    assert.deepEqual(listDir(top), before, 'nothing is written in the working directory');
  });

  test('an --out dir that exists and is not empty: exit 2, and the dir is left as it was', () => {
    const out = join(top, 'full');
    mkdirSync(out);
    writeFileSync(join(out, 'keep.txt'), 'mine\n');
    refused(generate(['--out', out, '--requests', '2', '--outputs', '0', '--open', '1']));
    assert.deepEqual(listDir(out), ['keep.txt']);
    assert.equal(readFileSync(join(out, 'keep.txt'), 'utf8'), 'mine\n');
  });

  const bad = [
    ['--requests', '0'], ['--requests', '-1'], ['--requests', '1.5'], ['--requests', 'abc'], ['--requests', ''],
    ['--outputs', '-1'], ['--outputs', '2.5'], ['--outputs', 'x'],
    ['--paragraphs', '0'], ['--paragraphs', '-3'], ['--paragraphs', '2.5'],
    ['--open', '-1'], ['--open', 'one'],
  ];
  for (const [opt, value] of bad) {
    test(`${opt} ${JSON.stringify(value)} is not a whole number in its range: exit 2, nothing written`, () => {
      const out = join(top, `bad${opt}-${value || 'empty'}`);
      refused(generate(['--out', out, '--requests', '3', '--outputs', '1', '--open', '1', opt, value]));
      assert.ok(!existsSync(out), `${out} is not made`);
    });
  }

  test('--open greater than --requests: exit 2, nothing written', () => {
    const out = join(top, 'open-too-many');
    refused(generate(['--out', out, '--requests', '2', '--open', '3', '--outputs', '0']));
    assert.ok(!existsSync(out));
  });

  test('an unknown option: exit 2, nothing written', () => {
    const out = join(top, 'unknown');
    refused(generate(['--out', out, '--requests', '2', '--open', '1', '--outputs', '0', '--frobnicate', '1']));
    assert.ok(!existsSync(out));
  });
});

// --- the small world, generated once

describe('generate.js on a small world', () => {
  let top;
  let dir;
  let world;
  let result;
  let started;
  const central = () => join(dir, 'central');
  const outDir = (name) => join(dir, name);
  const requestNames = () => [...world.openRequests, ...world.concluded];

  before(() => {
    top = tempDir();
    started = Date.now();
    ({ dir, world, result } = makeWorld(top, OPTS));
  });
  after(() => removeDir(top));

  test('it exits 0 and prints one summary line per repo', () => {
    const ls = linesOf(result.stdout);
    assert.equal(ls.length, 1 + OPTS.outputs, show(result));
    assert.ok(ls.some((l) => l.includes('central')), show(result));
    for (const name of ['out-01', 'out-02']) assert.ok(ls.some((l) => l.includes(name)), `${name}:\n${show(result)}`);
  });

  test('it writes central/, out-01/, out-02/ and world.json, and nothing more', () => {
    assert.deepEqual(listDir(dir), ['central', 'out-01', 'out-02', 'world.json']);
  });

  test('each repo is on main, with a clean working tree and no other branch', () => {
    for (const name of ['central', 'out-01', 'out-02']) {
      const s = repoState(join(dir, name));
      assert.equal(s.current, 'main', `${name} has main checked out`);
      assert.deepEqual(s.branches, ['main'], `${name} has no other branch`);
      assert.equal(s.status, '', `${name}: git status --porcelain is empty`);
    }
  });

  test("world.json holds the options, the repos with their main's full sha, and the request names", () => {
    assert.equal(world.requests, OPTS.requests);
    assert.equal(world.outputs, OPTS.outputs);
    assert.equal(world.paragraphs, OPTS.paragraphs);
    assert.equal(world.open, OPTS.open);
    assert.equal(world.central.path, 'central');
    assert.match(world.central.head, FULL);
    assert.equal(world.central.head, git(central(), 'rev-parse', 'refs/heads/main'));
    assert.deepEqual(world.repos.map((r) => [r.name, r.path]), [['out-01', 'out-01'], ['out-02', 'out-02']]);
    for (const r of world.repos) {
      assert.match(r.head, FULL);
      assert.equal(r.head, git(outDir(r.path), 'rev-parse', 'refs/heads/main'), r.name);
    }
    assert.equal(world.openRequests.length, OPTS.open);
    assert.equal(world.concluded.length, OPTS.requests - OPTS.open);
    const names = requestNames();
    assert.ok(names.every((n) => typeof n === 'string' && n.length > 0), JSON.stringify(names));
    assert.equal(new Set(names).size, OPTS.requests, `the names are distinct: ${JSON.stringify(names)}`);
    assert.ok(Array.isArray(world.removed));
    assert.ok(world.removed.every((id) => typeof id === 'string' && id.length > 0), JSON.stringify(world.removed));
  });

  test('determinism: a second run with the same options writes the same world.json and the same commits', async () => {
    // At least a second apart, so a commit date taken from the clock would show.
    const wait = 1100 - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    const again = makeWorld(top, OPTS, { name: 'world-again' });
    assert.deepEqual(again.world, world);
    assert.equal(readFileSync(join(again.dir, 'world.json'), 'utf8'), readFileSync(join(dir, 'world.json'), 'utf8'));
    for (const name of ['central', 'out-01', 'out-02']) {
      assert.equal(git(join(again.dir, name), 'rev-list', '--all').split('\n').sort().join('\n'),
        git(join(dir, name), 'rev-list', '--all').split('\n').sort().join('\n'), `${name}: the same commits`);
    }
    removeDir(again.dir);
  });

  test('central config lists every output repo by name and relative path; schema.yaml is there', () => {
    const config = readYamlFile(join(central(), '.assuredloop/config.yaml'));
    assert.ok(Array.isArray(config.outputs), JSON.stringify(config));
    assert.deepEqual(config.outputs.map((o) => ({ name: o.name, path: o.path })),
      [{ name: 'out-01', path: '../out-01' }, { name: 'out-02', path: '../out-02' }]);
    assert.ok(existsSync(join(central(), '.assuredloop/schema.yaml')));
  });

  test('specs/*.md holds the consolidated spec, with v4 markers', () => {
    const files = readdirSync(join(central(), 'specs')).filter((f) => f.endsWith('.md'));
    assert.ok(files.length >= 1, 'at least one spec file');
    for (const f of files) {
      const ids = markerIds(readFileSync(join(central(), 'specs', f), 'utf8'));
      assert.ok(ids.length >= 1, `specs/${f} has markers`);
    }
  });

  test('each concluded request is archived, each open one is not; each has request.md, spec.md and origin/', () => {
    for (const name of world.concluded) {
      const base = join(central(), 'requests/archive', name);
      assert.ok(!existsSync(join(central(), 'requests', name)), `${name} is not in requests/`);
      for (const f of ['request.md', 'spec.md']) assert.ok(existsSync(join(base, f)), `${base}/${f}`);
      assert.ok(statSync(join(base, 'origin')).isDirectory() && readdirSync(join(base, 'origin')).length >= 1, `${base}/origin/ holds snapshots`);
      assert.match(readFileSync(join(base, 'request.md'), 'utf8'), /\bStatus: concluded\b/, `${name}: request.md says Status: concluded`);
    }
    for (const name of world.openRequests) {
      const base = join(central(), 'requests', name);
      assert.ok(!existsSync(join(central(), 'requests/archive', name)), `${name} is not archived`);
      for (const f of ['request.md', 'spec.md']) assert.ok(existsSync(join(base, f)), `${base}/${f}`);
      assert.ok(statSync(join(base, 'origin')).isDirectory() && readdirSync(join(base, 'origin')).length >= 1, `${base}/origin/ holds snapshots`);
      assert.doesNotMatch(readFileSync(join(base, 'request.md'), 'utf8'), /\bStatus: concluded\b/, `${name} is open`);
    }
  });

  test('each request has its record, with status concluded or open', () => {
    for (const [names, status] of [[world.concluded, 'concluded'], [world.openRequests, 'open']]) {
      for (const name of names) {
        const rec = readYamlFile(join(central(), `.assuredloop/records/requests/${name}.yaml`));
        assert.equal(rec.status, status, `${name}.yaml`);
      }
    }
  });

  test('each change spec has from half to one and a half times --paragraphs paragraphs (6: 3 to 9), each with a marker', () => {
    for (const [names, base] of [[world.concluded, 'requests/archive'], [world.openRequests, 'requests']]) {
      for (const name of names) {
        const n = markerIds(readFileSync(join(central(), base, name, 'spec.md'), 'utf8')).length;
        assert.ok(n >= 3 && n <= 9, `${name}/spec.md has ${n} marked paragraphs`);
      }
    }
  });

  test('the exact v4 format: al-v4 index in central changes no file', () => {
    const r = al(central(), ['index']);
    assert.equal(r.code, 0, show(r));
    assert.equal(git(central(), 'status', '--porcelain'), '', `al-v4 index changed files:\n${show(r)}`);
  });

  test('the exact v4 format: al-v4 check in central prints no not ok line', () => {
    const r = al(central(), ['check']);
    assert.equal(r.code, 0, show(r));
    const bad = r.stdout.split('\n').filter((l) => l.startsWith('not ok'));
    assert.deepEqual(bad, [], show(r));
  });

  test('kept history: a merge commit per pull request on main, at least requests + concluded of them', () => {
    const merges = firstParentMerges(central()).filter((m) => PR_MERGE.test(m.subject));
    assert.ok(merges.length >= OPTS.requests + world.concluded.length,
      `${merges.length} pull request merges; subjects:\n${firstParentMerges(central()).map((m) => m.subject).join('\n')}`);
  });

  test('removed IDs: at least one; each was in specs/ at some commit of main, and is not at its head', () => {
    assert.ok(world.removed.length >= 1, 'a world with kept history has removed paragraphs to search');
    const atHead = specIdsAt(central(), 'main');
    const commits = git(central(), 'rev-list', 'main').split('\n');
    for (const id of world.removed) {
      assert.ok(!atHead.has(id), `${id} is not in specs/ at main`);
      assert.ok(commits.some((c) => specIdsAt(central(), c).has(id)), `${id} is in specs/ at some commit of main`);
    }
  });

  test('removed IDs: al-v4 search finds each in history, and not without --history', () => {
    for (const id of world.removed) {
      const hist = al(central(), ['search', '--level', '1', '--history', '--json', '--id', id]);
      assert.equal(hist.code, 0, show(hist));
      const h = JSON.parse(hist.stdout).hits.filter((x) => x.id === id);
      assert.ok(h.some((x) => x.role === 'history'), `${id} has a history hit:\n${hist.stdout.slice(0, 3000)}`);
      const now = al(central(), ['search', '--level', '1', '--json', '--id', id]);
      assert.equal(now.code, 0, show(now));
      const current = JSON.parse(now.stdout).hits.filter((x) => x.id === id && x.role !== 'history');
      assert.deepEqual(current, [], `${id} has no current hit`);
    }
  });

  test('each output repo: its config names the central repo', () => {
    for (const r of world.repos) {
      const config = readYamlFile(join(outDir(r.path), '.assuredloop/config.yaml'));
      assert.deepEqual(config.central, { path: '../central' }, r.name);
    }
  });

  test('each output repo: code and test files cite central IDs, each a spec ID at main or a removed one', () => {
    const known = new Set([...specIdsAt(central(), 'main'), ...world.removed]);
    for (const r of world.repos) {
      const d = outDir(r.path);
      const files = linesOf(git(d, 'ls-files')).filter((f) => !f.startsWith('.assuredloop/'));
      const cites = files.flatMap((f) => [...readFileSync(join(d, f), 'utf8').matchAll(/central:([A-Za-z0-9_./-]*[A-Za-z0-9_])/g)]
        .map((m) => ({ f, id: m[1] })));
      assert.ok(cites.length >= 1, `${r.name} cites central IDs`);
      for (const { f, id } of cites) assert.ok(known.has(id), `${r.name}/${f} cites central:${id}, not a spec ID at main nor removed`);
    }
  });

  test('each output repo: result files in the v4 result format, each commit a commit of that repo', () => {
    for (const r of world.repos) {
      const d = outDir(r.path);
      const files = (listDir(join(d, '.assuredloop/results')) ?? []).filter((f) => f.endsWith('.yaml'));
      assert.ok(files.length >= 1, `${r.name} has result files`);
      for (const f of files) {
        const res = readYamlFile(join(d, '.assuredloop/results', f));
        assert.equal(typeof res.check, 'string', `${r.name}/${f}: check`);
        assert.ok(['pass', 'fail', 'not run'].includes(res.outcome), `${r.name}/${f}: outcome ${res.outcome}`);
        assert.equal(typeof res.commit, 'string', `${r.name}/${f}: commit`);
        const ok = tryGit(d, 'merge-base', '--is-ancestor', res.commit, 'main');
        assert.equal(ok.code, 0, `${r.name}/${f}: commit ${res.commit} is a commit of main`);
        assert.ok(Array.isArray(res.inputs) && res.inputs.length >= 1, `${r.name}/${f}: inputs`);
        for (const i of res.inputs) {
          assert.equal(typeof i.file, 'string', `${r.name}/${f}: input file`);
          assert.match(String(i.sha256), /^[0-9a-f]{64}$/, `${r.name}/${f}: input sha256`);
        }
      }
    }
  });

  test('each output repo: a merge per pull request; its commits name a central task', () => {
    const records = Object.fromEntries(requestNames().map((n) => [n, readYamlFile(join(central(), `.assuredloop/records/requests/${n}.yaml`))]));
    for (const r of world.repos) {
      const d = outDir(r.path);
      const merges = firstParentMerges(d).filter((m) => PR_MERGE.test(m.subject));
      assert.ok(merges.length >= 1, `${r.name} has pull request merges`);
      for (const m of merges) {
        const body = git(d, 'log', '--format=%B', `${m.sha}^1..${m.sha}^2`);
        const named = [...body.matchAll(/central:([^\s/]+)\/(T\d+)/g)];
        assert.ok(named.length >= 1, `${r.name} ${m.subject}: the pull request's commit names central:<request>/T<n>:\n${body}`);
        for (const [, req, task] of named) {
          assert.ok(records[req], `${r.name} ${m.subject}: ${req} is a request of the world`);
          assert.ok((records[req].tasks ?? []).some((t) => t.id === task), `${r.name} ${m.subject}: ${req} has task ${task}`);
        }
      }
    }
  });

  test("each request record has a task whose prs names an output repo's pull request", () => {
    const prsOf = Object.fromEntries(world.repos.map((r) => [r.name,
      new Set(firstParentMerges(outDir(r.path)).map((m) => PR_MERGE.exec(m.subject)?.[1]).filter(Boolean))]));
    for (const name of requestNames()) {
      const rec = readYamlFile(join(central(), `.assuredloop/records/requests/${name}.yaml`));
      const refs = (rec.tasks ?? []).flatMap((t) => t.prs ?? []).map(String).filter((p) => /^out-\d{2,}#\d+$/.test(p));
      assert.ok(refs.length >= 1, `${name}: a task names out-NN#<n>: ${JSON.stringify(rec.tasks)}`);
      for (const p of refs) {
        const [repo, n] = p.split('#');
        assert.ok(prsOf[repo], `${name}: ${p} names a repo of the world`);
        assert.ok(prsOf[repo].has(n), `${name}: ${p} is a merged pull request of ${repo}`);
      }
    }
  });

  // --- the adoption (design.md 5 and 14; decision D16 of PR #184)

  const adoption = () => readYamlFile(join(central(), '.assuredloop/records/requests/adoption.yaml'));
  // The one commit that every adoption disposition names.
  const adoptingCommit = () => {
    const commits = [...new Set((adoption().dispositions ?? []).map((d) => d.commit))];
    assert.equal(commits.length, 1, `the adoption dispositions name one commit: ${JSON.stringify(commits)}`);
    return commits[0];
  };

  test('the adoption is the archived request adoption, concluded, and not one of the --requests requests', () => {
    const md = join(central(), 'requests/archive/adoption/request.md');
    assert.ok(existsSync(md), md);
    assert.match(readFileSync(md, 'utf8'), /\bStatus: concluded\b/, 'adoption/request.md says Status: concluded');
    assert.ok(!existsSync(join(central(), 'requests/adoption')), 'adoption is not an open request');
    assert.equal(adoption().status, 'concluded');
    assert.ok(!world.concluded.includes('adoption') && !world.openRequests.includes('adoption'), 'adoption is not in world.json');
    assert.equal(requestNames().length, OPTS.requests);
  });

  test('the adoption record: one incorporated disposition per promise or design paragraph of specs/ at the adopting commit', () => {
    const ds = adoption().dispositions;
    assert.ok(Array.isArray(ds) && ds.length >= 1, `dispositions: ${JSON.stringify(ds)}`);
    const C = adoptingCommit();
    assert.match(C, FULL, 'the full hash of the adopting commit');
    for (const d of ds) {
      assert.equal(d.source, 'adoption', JSON.stringify(d));
      assert.equal(d.disposition, 'incorporated', JSON.stringify(d));
      assert.match(String(d.spec_sha256), /^[0-9a-f]{64}$/, JSON.stringify(d));
    }
    const rows = exportAt(central(), C).filter((r) => r.role === 'baseline' && String(r.file).startsWith('specs/'));
    const kinds = [...PROMISE_KINDS, ...DESIGN_KINDS];
    const want = new Map(rows.filter((r) => kinds.includes(r.kind)).map((r) => [r.id, r.sha256]));
    assert.ok(want.size >= 1, 'specs/ at the adopting commit has promise or design paragraphs');
    const ids = ds.map((d) => d.spec);
    assert.equal(new Set(ids).size, ids.length, `one disposition per paragraph: ${ids.join(' ')}`);
    assert.deepEqual([...ids].sort(), [...want.keys()].sort(), 'the dispositions name exactly the promise and design paragraphs');
    for (const d of ds) assert.equal(d.spec_sha256, want.get(d.spec), `${d.spec}: spec_sha256 is its text hash at ${C}`);
  });

  test('the adopting commit is on main and is the first with the spec: no parent of it has a spec paragraph', () => {
    const C = adoptingCommit();
    assert.equal(tryGit(central(), 'merge-base', '--is-ancestor', C, 'main').code, 0, `${C} is a commit of main`);
    assert.ok(specIdsAt(central(), C).size >= 1, `specs/ at ${C} has paragraphs`);
    const parents = git(central(), 'rev-list', '--parents', '-n', '1', C).split(' ').slice(1);
    for (const p of parents) assert.equal(specIdsAt(central(), p).size, 0, `parent ${p} has no spec paragraph`);
  });

  // PR #184 adds the checks that read the adoption (src/v4/checks.js). Until it
  // is merged, this al has no such check, and the test is skipped.
  const has184 = existsSync(join(REPO, 'src/v4/checks.js'));
  test("with PR #184's checks, an adopted paragraph whose text is unchanged gets no no-link hint",
    { skip: !has184 && 'needs the checks of PR #184 (src/v4/checks.js)' }, () => {
      const now = new Map(exportAt(central(), 'main').filter((r) => r.role === 'baseline' && String(r.file).startsWith('specs/')).map((r) => [r.id, r.sha256]));
      const unchanged = adoption().dispositions.filter((d) => now.get(d.spec) === d.spec_sha256).map((d) => d.spec);
      assert.ok(unchanged.length >= 1, 'some adopted paragraph is unchanged at main');
      const r = al(central(), ['check']);
      assert.equal(r.code, 0, show(r));
      const noLink = r.stdout.split('\n').map((l) => /^(?:hint|not ok) no-link \S+ (\S+)/.exec(l)?.[1]).filter(Boolean);
      assert.deepEqual(unchanged.filter((id) => noLink.includes(id)), [], show(r));
    });
});

// --- edge sizes: no output repo, one paragraph, an --out dir that exists and is empty

describe('generate.js with no output repo and --paragraphs 1', () => {
  let top;
  let dir;
  let world;
  before(() => {
    top = tempDir();
    dir = join(top, 'world');
    mkdirSync(dir);
    const r = generate(['--out', dir, '--requests', '3', '--outputs', '0', '--paragraphs', '1', '--open', '1']);
    assert.equal(r.code, 0, show(r));
    assert.equal(linesOf(r.stdout).length, 1, `one summary line, for central:\n${show(r)}`);
    world = JSON.parse(readFileSync(join(dir, 'world.json'), 'utf8'));
  });
  after(() => removeDir(top));

  test('an empty --out dir is used; only central/ and world.json are written; repos is []', () => {
    assert.deepEqual(listDir(dir), ['central', 'world.json']);
    assert.deepEqual(world.repos, []);
    assert.equal(world.outputs, 0);
    const s = repoState(join(dir, 'central'));
    assert.deepEqual([s.current, s.branches, s.status], ['main', ['main'], '']);
  });

  test('each change spec has 1 or 2 marked paragraphs (at least 1)', () => {
    for (const [names, base] of [[world.concluded, 'requests/archive'], [world.openRequests, 'requests']]) {
      for (const name of names) {
        const n = markerIds(readFileSync(join(dir, 'central', base, name, 'spec.md'), 'utf8')).length;
        assert.ok(n >= 1 && n <= 2, `${name}/spec.md has ${n} marked paragraphs`);
      }
    }
  });

  test('the central repo is still in the exact v4 format', () => {
    const c = join(dir, 'central');
    const ix = al(c, ['index']);
    assert.equal(ix.code, 0, show(ix));
    assert.equal(git(c, 'status', '--porcelain'), '');
    const ck = al(c, ['check']);
    assert.equal(ck.code, 0, show(ck));
    assert.deepEqual(ck.stdout.split('\n').filter((l) => l.startsWith('not ok')), [], show(ck));
  });

  test('the kept history has at least requests + concluded pull request merges', () => {
    const merges = firstParentMerges(join(dir, 'central')).filter((m) => PR_MERGE.test(m.subject));
    assert.ok(merges.length >= 3 + world.concluded.length, `${merges.length} merges`);
  });
});

// --open 0 and --open = --requests are in range.
test('generate.js: --open 0 concludes every request; --open equal to --requests concludes none', () => {
  const top = tempDir();
  try {
    const all = makeWorld(top, { requests: 2, outputs: 0, paragraphs: 2, open: 0 }, { name: 'none-open' }).world;
    assert.deepEqual([all.openRequests.length, all.concluded.length], [0, 2]);
    const none = makeWorld(top, { requests: 2, outputs: 0, paragraphs: 2, open: 2 }, { name: 'all-open' }).world;
    assert.deepEqual([none.openRequests.length, none.concluded.length], [2, 0]);
  } finally {
    removeDir(top);
  }
});
