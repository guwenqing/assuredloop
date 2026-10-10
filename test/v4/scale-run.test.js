// scale/run.js (#188, T15; interface.md "scale/run.js"): the refusals, the
// report of the five measures on a small generated world, the removal check,
// the repos put back as they were, a second run, and a failed al command.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AL4, FULL, git, makeWorld, removeDir, repoState, runHarness, show, specIdsAt, tempDir, tryGit, worldRepos,
} from './helpers/scale.js';

const OPTS = { requests: 6, outputs: 2, paragraphs: 6, open: 2 };
const CRITERIA = { check: 10, 'full-index': 900, 'incremental-index': 120, removal: 120, search: 2 };
const NAMES = Object.keys(CRITERIA);
const isLoad = (l) => Array.isArray(l) && l.length === 3 && l.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0);

// Exit 2 and a `run: ` line on stderr.
const refused = (r) => {
  assert.equal(r.code, 2, show(r));
  assert.match(r.stderr, /^run: /m, show(r));
};

// These refusals need no generated world.
describe('run.js refusals with no world', () => {
  let top;
  before(() => { top = tempDir(); });
  after(() => removeDir(top));

  test('no --world', () => refused(runHarness(['--repeat', '1'])));

  test('a world with no world.json', () => {
    const empty = join(top, 'empty-world');
    mkdirSync(empty);
    refused(runHarness(['--world', empty]));
    refused(runHarness(['--world', join(top, 'no-such-world')]));
  });
});

describe('run.js', () => {
  let top;
  let dir;
  let world;
  let repos;
  let before0;

  // The state of every repo of the world, by name.
  const states = () => Object.fromEntries(repos.map((r) => [r.name, repoState(r.dir)]));
  const assertRestored = (label) => {
    const now = states();
    for (const r of repos) {
      assert.deepEqual(now[r.name], before0[r.name], `${label}: ${r.name} is back on main at its old commit, clean, with no extra branch`);
    }
  };
  const readReport = () => ({
    md: readFileSync(join(dir, 'report.md'), 'utf8'),
    json: JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')),
  });
  const clearReport = () => {
    rmSync(join(dir, 'report.md'), { force: true });
    rmSync(join(dir, 'report.json'), { force: true });
  };

  before(() => {
    top = tempDir();
    ({ dir, world } = makeWorld(top, OPTS));
    repos = worldRepos(dir, world);
    before0 = states();
    for (const r of repos) assert.deepEqual([before0[r.name].current, before0[r.name].branches, before0[r.name].status], ['main', ['main'], ''], r.name);
  });
  after(() => removeDir(top));

  // --- refusals: exit 2 and a `run: ` line on stderr

  // The world is valid here, so each refusal is for the option named.
  describe('refusals', () => {
    test('--al that is not a file', () => {
      refused(runHarness(['--world', dir, '--al', join(top, 'no-such-al.js')]));
      refused(runHarness(['--world', dir, '--al', top]));
    });

    for (const [opt, value] of [['--repeat', '0'], ['--repeat', '-1'], ['--repeat', '1.5'], ['--repeat', 'x'],
      ['--queries', '0'], ['--queries', '2.5'], ['--queries', 'many']]) {
      test(`${opt} ${value} is not a whole number >= 1`, () => refused(runHarness(['--world', dir, opt, value])));
    }

    test('an unknown option', () => refused(runHarness(['--world', dir, '--frobnicate', '1'])));

    test('after the refusals, every repo is as it was', () => assertRestored('after the refusals'));
  });

  // --- a full run: --repeat 1 --queries 2

  describe('a run with --repeat 1 --queries 2', () => {
    let r;
    let md;
    let rep;
    before(() => {
      clearReport();
      r = runHarness(['--world', dir, '--repeat', '1', '--queries', '2']);
      if (existsSync(join(dir, 'report.json'))) ({ md, json: rep } = readReport());
    });

    test('it exits 0, writes report.md and report.json, and prints report.md', () => {
      assert.equal(r.code, 0, show(r));
      assert.ok(existsSync(join(dir, 'report.md')) && existsSync(join(dir, 'report.json')), show(r));
      assert.ok(r.stdout.includes(md.trim()), `report.md is printed to stdout:\n${show(r)}`);
      assert.equal(rep.ok, true);
    });

    test('report.json: al (path, commit, dirty), the machine and the world', () => {
      assert.equal(realpathSync(rep.al.path), realpathSync(AL4));
      assert.equal(rep.al.commit, git(join(AL4, '..'), 'rev-parse', 'HEAD'));
      assert.equal(typeof rep.al.dirty, 'boolean');
      for (const k of ['model', 'cpu', 'os', 'node']) assert.ok(typeof rep.machine[k] === 'string' && rep.machine[k].length > 0, `machine.${k}`);
      assert.ok(Number.isInteger(rep.machine.cores) && rep.machine.cores >= 1, 'machine.cores');
      assert.ok(Number.isInteger(rep.machine.memoryBytes) && rep.machine.memoryBytes > 0, 'machine.memoryBytes');
      assert.ok(rep.machine.node.includes(process.versions.node), `machine.node ${rep.machine.node}`);
      assert.deepEqual(rep.world, world);
    });

    test('report.json: the five measures, each with its criterion, its runs and a number of seconds', () => {
      assert.deepEqual(rep.measures.map((m) => m.name).sort(), [...NAMES].sort());
      for (const m of rep.measures) {
        assert.equal(m.criterion.seconds, CRITERIA[m.name], `${m.name}: criterion`);
        assert.ok(typeof m.criterion.text === 'string' && m.criterion.text.length > 0, `${m.name}: criterion text`);
        assert.ok(Array.isArray(m.runs) && m.runs.length >= 1, `${m.name}: runs`);
        for (const run of m.runs) {
          assert.ok(typeof run.seconds === 'number' && Number.isFinite(run.seconds) && run.seconds >= 0, `${m.name}: seconds ${run.seconds}`);
          assert.match(run.commit, FULL, `${m.name}: commit`);
          assert.equal(git(join(dir, 'central'), 'cat-file', '-t', run.commit), 'commit', `${m.name}: ${run.commit} is a commit of central`);
          assert.ok(isLoad(run.loadBefore), `${m.name}: loadBefore ${JSON.stringify(run.loadBefore)}`);
          assert.ok(isLoad(run.loadAfter), `${m.name}: loadAfter ${JSON.stringify(run.loadAfter)}`);
          assert.equal(run.exit, 0, `${m.name}: exit`);
          assert.ok(typeof run.command === 'string' && run.command.length > 0, `${m.name}: command`);
        }
        assert.equal(m.seconds, Math.max(...m.runs.map((x) => x.seconds)), `${m.name}: seconds is the largest run`);
        assert.equal(m.met, m.runs.every((x) => x.exit === 0) && m.seconds <= m.criterion.seconds, `${m.name}: met`);
      }
      const by = Object.fromEntries(rep.measures.map((m) => [m.name, m]));
      assert.equal(by.check.runs.length, 1, '--repeat 1: one run of al check');
      assert.equal(by.search.runs.length, 2, '--queries 2: two queries');
      assert.ok(by.check.runs.every((x) => /\bcheck\b/.test(x.command)), 'check runs al check');
      for (const n of ['full-index', 'incremental-index', 'removal', 'search']) {
        assert.ok(by[n].runs.every((x) => /\bsearch\b/.test(x.command) && /--level[ =]1\b/.test(x.command)), `${n} runs al search --level 1`);
      }
      assert.ok(by['full-index'].runs.every((x) => x.command.includes('--rebuild')), 'full-index runs with --rebuild');
      assert.equal(new Set(by.search.runs.map((x) => x.command)).size, 2, 'two different queries');
    });

    test('the commits the measures ran at follow the steps', () => {
      const c = join(dir, 'central');
      const by = Object.fromEntries(rep.measures.map((m) => [m.name, m]));
      const one = (n) => {
        const cs = new Set(by[n].runs.map((x) => x.commit));
        assert.equal(cs.size, 1, `${n} ran at one commit`);
        return [...cs][0];
      };
      const [check, full, inc, rem, srch] = NAMES.map(one);
      const ancestor = (a, b) => tryGit(c, 'merge-base', '--is-ancestor', a, b).code === 0;
      assert.equal(full, world.central.head, 'full-index runs on main as it was');
      assert.ok(check !== world.central.head && ancestor(world.central.head, check), 'check runs at a branch off main');
      assert.ok(ancestor(check, inc) && inc !== check, 'incremental-index runs after the branch is merged');
      assert.ok(git(c, 'rev-list', '--parents', '-n', '1', inc).split(' ').length >= 3, 'the branch is merged with a merge commit');
      assert.ok(ancestor(inc, rem) && rem !== inc, 'removal runs after a later merge');
      assert.equal(srch, rem, 'search runs on the up-to-date index');
    });

    test('the removal block: IDs removed by the run, gone from the current index and kept in history', () => {
      const c = join(dir, 'central');
      const by = Object.fromEntries(rep.measures.map((m) => [m.name, m]));
      assert.ok(Array.isArray(rep.removal.ids) && rep.removal.ids.length >= 1, JSON.stringify(rep.removal));
      assert.equal(rep.removal.goneFromCurrent, true);
      assert.equal(rep.removal.keptInHistory, true);
      const inc = by['incremental-index'].runs[0].commit;
      const rem = by.removal.runs[0].commit;
      const atInc = specIdsAt(c, inc);
      const atRem = specIdsAt(c, rem);
      for (const id of rep.removal.ids) {
        assert.ok(atInc.has(id), `${id} is in specs/ before the removal`);
        assert.ok(!atRem.has(id), `${id} is not in specs/ after the removal`);
      }
    });

    test('report.md: each measure with its criterion, met or missed, its commit; the machine; the load; al commit', () => {
      for (const m of rep.measures) {
        assert.ok(md.includes(m.name), `report.md names ${m.name}`);
        assert.ok(md.includes(String(m.criterion.seconds)), `report.md has ${m.name}'s criterion`);
        for (const run of m.runs) assert.ok(md.includes(run.commit.slice(0, 7)), `report.md has ${m.name}'s commit ${run.commit}`);
      }
      assert.match(md, /\b(met|missed)\b/);
      assert.match(md, /\bload\b/i);
      for (const k of ['model', 'cpu', 'os']) assert.ok(md.includes(rep.machine[k]), `report.md has machine.${k}: ${rep.machine[k]}`);
      assert.ok(md.includes(String(rep.machine.cores)), 'report.md has the cores');
      assert.ok(md.includes(process.versions.node), 'report.md has the node version');
      assert.ok(md.includes(rep.al.commit.slice(0, 7)), "report.md has al's commit");
    });

    test('every repo is back: main at its old commit, a clean tree, no extra branch', () => assertRestored('after the run'));
  });

  describe('a second run on the same world', () => {
    let r;
    before(() => {
      clearReport();
      r = runHarness(['--world', dir, '--repeat', '1', '--queries', '2']);
    });

    test('it works the same way: exit 0, the report, the five measures, the removal block', () => {
      assert.equal(r.code, 0, show(r));
      const { json } = readReport();
      assert.equal(json.ok, true);
      assert.deepEqual(json.measures.map((m) => m.name).sort(), [...NAMES].sort());
      assert.equal(json.measures.find((m) => m.name === 'full-index').runs[0].commit, world.central.head);
      assert.equal(json.removal.goneFromCurrent, true);
      assert.equal(json.removal.keptInHistory, true);
    });

    test('every repo is back again', () => assertRestored('after the second run'));
  });

  // --- an al that fails: exit 1, the report still written, the repos put back

  describe('an al command that fails', () => {
    let r;
    let alRepo;
    before(() => {
      clearReport();
      alRepo = join(top, 'fake-al');
      mkdirSync(alRepo);
      writeFileSync(join(alRepo, 'al.js'), "process.stderr.write('fake al: it always fails\\n');\nprocess.exit(1);\n");
      git(alRepo, 'init', '-q', '-b', 'main');
      git(alRepo, 'add', 'al.js');
      git(alRepo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'fake al');
      r = runHarness(['--world', dir, '--al', join(alRepo, 'al.js'), '--repeat', '1', '--queries', '1']);
    });

    test('it exits 1, and still writes the report, which names the failed command', () => {
      assert.equal(r.code, 1, show(r));
      const { md, json } = readReport();
      assert.equal(json.ok, false);
      assert.equal(realpathSync(json.al.path), realpathSync(join(alRepo, 'al.js')));
      assert.equal(json.al.commit, git(alRepo, 'rev-parse', 'HEAD'));
      assert.equal(json.al.dirty, false);
      const failed = json.measures.flatMap((m) => m.runs.filter((x) => x.exit !== 0).map((x) => ({ m, x })));
      assert.ok(failed.length >= 1, 'a run records its failed exit');
      for (const { m } of failed) assert.equal(m.met, false, `${m.name} is not met`);
      assert.ok(failed.some(({ m }) => md.includes(m.name)), 'report.md names the failed measure');
      assert.match(md, /fail|exit|killed/i, 'report.md says why');
    });

    test('every repo is back', () => assertRestored('after the failed run'));
  });
});
