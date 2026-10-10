// The invoicer fixture world (#179): builds a state of test/v4/fixtures/invoicer
// through the public commands, as a throwaway git repo. Nothing here reads the
// code under test. See test/v4/fixtures/invoicer/README.md for the case format.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { al, git, show } from './project.js';

export const FIXTURES = fileURLToPath(new URL('../fixtures/invoicer/', import.meta.url));
const CASES = join(FIXTURES, 'cases');

// Built states, kept for the life of the test process; each test gets a copy.
const WORK = mkdtempSync(join(realpathSync(tmpdir()), 'al-v4-world-'));
process.on('exit', () => rmSync(WORK, { recursive: true, force: true }));
const built = new Map();
let serial = 0;

export const loadCase = (name) => parse(readFileSync(join(CASES, `${name}.yaml`), 'utf8'));

const epoch = (date) => String(Date.parse(date.length === 10 ? `${date}T09:30:00Z` : date) / 1000);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const put = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const readYaml = (dir, rel) => parse(readFileSync(join(dir, rel), 'utf8'));
const writeYaml = (dir, rel, value) => put(dir, rel, stringify(value));
const recordFile = (name) => `.assuredloop/records/requests/${name}.yaml`;

function run(dir, args, { input = '', date } = {}) {
  const r = al(dir, args.map(String), { input, env: date ? { SOURCE_DATE_EPOCH: epoch(date) } : {} });
  assert.equal(r.code, 0, `fixture step failed in ${dir}\n${show(r)}`);
  return r;
}

function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', message);
}

function editRecord(dir, name, change) {
  const rec = readYaml(dir, recordFile(name));
  change(rec);
  writeYaml(dir, recordFile(name), rec);
}

function textOf(caseDir, value) {
  if (typeof value === 'string') return value;
  if (value?.file) return readFileSync(join(caseDir, value.file), 'utf8');
  throw new Error(`no text in ${JSON.stringify(value)}`);
}

// One step of a case. Each step is a map with one of the keys below.
function step(dir, caseDir, s) {
  if (s.files !== undefined) {
    const { from, to = '.' } = typeof s.files === 'string' ? { from: s.files } : s.files;
    cpSync(join(caseDir, from), join(dir, to), { recursive: true });
  } else if (s.write) {
    put(dir, s.write.file, textOf(caseDir, s.write.text ?? s.write));
  } else if (s.edit) {
    const { file } = s.edit;
    const from = textOf(caseDir, s.edit.from);
    const to = textOf(caseDir, s.edit.to);
    const text = readFileSync(join(dir, file), 'utf8');
    assert.equal(text.split(from).length, 2, `${file} has the text to edit once: ${JSON.stringify(from)}`);
    writeFileSync(join(dir, file), text.replace(from, () => to));
  } else if (s.delete) {
    assert.ok(existsSync(join(dir, s.delete)), `${s.delete} exists`);
    rmSync(join(dir, s.delete), { recursive: true });
  } else if (s.move) {
    mkdirSync(dirname(join(dir, s.move.to)), { recursive: true });
    renameSync(join(dir, s.move.from), join(dir, s.move.to));
  } else if (s.archive) {
    mkdirSync(join(dir, 'requests/archive'), { recursive: true });
    renameSync(join(dir, 'requests', s.archive), join(dir, 'requests/archive', s.archive));
  } else if (s.al) {
    run(dir, s.al, { input: s.input === undefined ? '' : textOf(caseDir, s.input), date: s.date });
  } else if (s.index !== undefined) {
    run(dir, ['index'], { date: s.date });
  } else if (s.align) {
    run(dir, ['index', '--align', s.align], { date: s.date });
  } else if (s.section) {
    const path = `requests/${s.section.request}/request.md`;
    let md = readFileSync(join(dir, path), 'utf8');
    if (!md.endsWith('\n')) md += '\n';
    writeFileSync(join(dir, path), `${md}\n${textOf(caseDir, s.section.text)}`);
  } else if (s.dispositions) {
    editRecord(dir, s.dispositions.request, (rec) => { rec.dispositions = [...(rec.dispositions ?? []), ...s.dispositions.add]; });
  } else if (s.disposition) {
    // Changes the latest entry for one source, keeping its filled hashes.
    const { request, source, set } = s.disposition;
    editRecord(dir, request, (rec) => {
      const found = (rec.dispositions ?? []).filter((d) => d.source === source).at(-1);
      assert.ok(found, `${request} has a disposition for ${source}`);
      Object.assign(found, set);
    });
  } else if (s.dispositionsDrop) {
    // Removes the dispositions of one request that name one spec ID.
    const { request, spec } = s.dispositionsDrop;
    editRecord(dir, request, (rec) => {
      const before = (rec.dispositions ?? []).length;
      rec.dispositions = (rec.dispositions ?? []).filter((d) => d.spec !== spec);
      assert.ok(rec.dispositions.length < before, `${request} has a disposition for ${spec}`);
    });
  } else if (s.adoption) {
    // The adoption record, by hand in the T9 format (decision D12): the archived
    // request `adoption`, and one disposition per adopted paragraph with the
    // adopting commit (HEAD) and the paragraph's text hash from the per-doc
    // record (so run index first).
    const { doc, ids, text } = s.adoption;
    const rec = readYaml(dir, `.assuredloop/records/${doc}.yaml`);
    const commit = git(dir, 'rev-parse', 'HEAD');
    const dispositions = ids.map((id) => {
      const p = rec.paragraphs.find((x) => x.id === id);
      assert.ok(p, `${id} is in the record of ${doc}`);
      return { source: 'adoption', disposition: 'incorporated', spec: id, commit, spec_sha256: p.text_sha256 };
    });
    put(dir, 'requests/archive/adoption/request.md', `# Adoption
Tier: 1 · Status: concluded

${text}`);
    writeYaml(dir, recordFile('adoption'), { schema: 'assuredloop/1', request: 'adoption', status: 'concluded', dispositions });
  } else if (s.decision) {
    const { request, id, set } = s.decision;
    editRecord(dir, request, (rec) => {
      const found = (rec.decisions ?? []).find((d) => d.id === id);
      assert.ok(found, `${request} has decision ${id}`);
      Object.assign(found, set);
    });
  } else if (s.recordSet) {
    editRecord(dir, s.recordSet.request, (rec) => Object.assign(rec, s.recordSet.set));
  } else if (s.hint) {
    // An AI hint on a paragraph of a per-doc record; its basis is the paragraph's
    // hash in that record now (so run index first), unless `basis` is given.
    const { doc, id, basis, ...hint } = s.hint;
    const rel = `.assuredloop/records/${doc}.yaml`;
    const rec = readYaml(dir, rel);
    const p = rec.paragraphs.find((x) => x.id === id);
    assert.ok(p, `${id} is in ${rel}`);
    p.hint = { basis_sha256: basis ?? p.text_sha256, ...hint };
    writeYaml(dir, rel, rec);
  } else if (s.result) {
    // A result file: commit HEAD (or HEAD~n) becomes that commit's full hash;
    // an input given as a path gets the sha256 of the file's bytes now.
    const { file, commit, inputs, ...rest } = s.result;
    const value = { ...rest, commit: /^HEAD/.test(commit) ? git(dir, 'rev-parse', commit) : commit };
    if (inputs) {
      value.inputs = inputs.map((i) => (typeof i === 'string' ? { file: i, sha256: sha(readFileSync(join(dir, i))) } : i));
    }
    writeYaml(dir, `.assuredloop/results/${file}`, value);
  } else if (s.commit) {
    commitAll(dir, s.commit);
  } else {
    throw new Error(`unknown fixture step: ${JSON.stringify(s)}`);
  }
}

function newRepo() {
  const dir = join(WORK, `s${++serial}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Fixture Author');
  git(dir, 'config', 'user.email', 'author@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
  // No background gc: it would repack objects while a state is copied.
  git(dir, 'config', 'gc.auto', '0');
  git(dir, 'config', 'maintenance.auto', 'false');
  commitAll(dir, 'Start the repository');
  return dir;
}

function copyOf(src) {
  const dir = join(WORK, `s${++serial}`);
  cpSync(src, dir, { recursive: true });
  return dir;
}

const message = (c, arm) => {
  const claim = arm?.claim ?? c.claim;
  return claim ? `${c.title}\n\n${claim}` : c.title;
};

// A built state: on main (as the parent of another case), or on the branch
// `pr` cut from main, with the case's commit on it.
function state(name, armName, onMain) {
  const key = `${name}:${armName ?? ''}:${onMain ? 'main' : 'pr'}`;
  if (built.has(key)) return built.get(key);
  const c = loadCase(name);
  const caseDir = join(CASES, name);
  const arms = c.arms ?? {};
  if (armName) assert.ok(arms[armName], `case ${name} has the arm ${armName}`);
  else assert.ok(!c.arms, `case ${name} needs an arm: ${Object.keys(arms).join(', ')}`);
  const arm = armName ? arms[armName] : null;
  const dir = c.base ? copyOf(state(c.base, c.baseArm ?? null, true)) : newRepo();
  if (!onMain) git(dir, 'checkout', '-q', '-b', 'pr');
  for (const s of [...(c.steps ?? []), ...(arm?.steps ?? []), ...(c.after ?? [])]) step(dir, caseDir, s);
  commitAll(dir, message(c, arm));
  built.set(key, dir);
  return dir;
}

// A copy of the state <name> (arm <arm>, for a case with arms) for one test,
// on the branch `pr`, removed when the test ends.
export function invoicer(t, name, arm) {
  const dir = copyOf(state(name, arm ?? null, false));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// --- the check's output

// A finding line: <severity> <code> <file>[:<line>] <id> <message>.
const FINDING = /^(not ok|hint|info) (\S+) (\S+?)(?::(\d+))? (\S+)(?: (.*))?$/;

export function findings(stdout) {
  return stdout.split('\n').map((l) => FINDING.exec(l)).filter(Boolean)
    .map(([line, severity, code, file, at, id, msg = '']) => ({ line, severity, code, file, at: at === undefined ? null : Number(at), id, msg }));
}

export const key = (f) => `${f.severity} ${f.code} ${f.id}`;
export const keys = (list) => [...new Set(list.map(key))].sort();

// The keys in a and not in b.
export const minus = (a, b) => {
  const other = new Set(keys(b));
  return keys(a).filter((k) => !other.has(k));
};

export function check(dir, ...args) {
  const r = al(dir, ['check', ...args]);
  return { ...r, findings: findings(r.stdout) };
}
