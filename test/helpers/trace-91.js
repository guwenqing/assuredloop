// The checks of the tests of #91: the full trace (`al context <name>
// --audit`) shows each judgement of the request's record with its state,
// and each Binding line names its judgement and judged_target_sha256.
// Nothing here reads the code under test: the tests use only the al
// command, the files that it writes and the YAML records.
import assert from 'node:assert/strict';
import { ok, read, record, recordPath, show } from './project.js';
import { NAME, judgedLines } from './judgement-88.js';

export const out = (r) => r.stdout.split('\n');

// `al context <name> --audit [...extra]`, exit 0.
export const audit = (dir, extra = [], name = NAME) => ok(dir, ['context', name, '--audit', ...extra]);

export const judgementLines = (r) => out(r).filter((l) => l.startsWith('Judgement '));
export const bindingLines = (r) => out(r).filter((l) => l.startsWith('Binding   '));
export function recordsLine(r) {
  const found = out(r).filter((l) => l.startsWith('Records   '));
  assert.equal(found.length, 1, `one Records line:\n${show(r)}`);
  return found[0];
}

// The 1-based line where each entry of `judgements:` starts in the record
// file, in record order: the "- " lines at the indent of the list's items.
export function entryStarts(dir, name = NAME) {
  const text = read(dir, recordPath(name));
  const ls = text.split('\n');
  const at = ls.findIndex((l) => /^judgements:\s*$/.test(l));
  assert.ok(at >= 0, `the record has a block "judgements:" list:\n${text}`);
  const starts = [];
  let indent = null;
  for (let i = at + 1; i < ls.length; i++) {
    const l = ls[i];
    if (l.trim() === '') continue;
    const own = l.length - l.trimStart().length;
    const item = l.trimStart().startsWith('- ');
    if (indent === null) {
      assert.ok(item, `the first line after "judgements:" starts an entry: ${l}`);
      indent = own;
    }
    if (own < indent || (own === indent && !item)) break;
    if (own === indent && item) starts.push(i + 1);
  }
  const entries = record(dir, name).judgements ?? [];
  assert.equal(starts.length, entries.length, `one start line for each judgement entry:\n${text}`);
  return starts;
}

// The Judgement line that the agreed wording gives for the entry J<n>.
export function expectedJudgement(dir, n, state, name = NAME) {
  const entries = record(dir, name).judgements ?? [];
  const i = entries.findIndex((j) => j.id === `J${n}`);
  assert.ok(i >= 0, `the record of ${name} holds J${n}`);
  const j = entries[i];
  const line = entryStarts(dir, name)[i];
  return `Judgement J${n} ${j.hint} ${j.on} recorded ${j.recorded} (${recordPath(name)}:${line}): ${state}; reason: ${j.reason}`;
}

// The one trace line of J<n> is the agreed line with this state.
export function hasJudgement(r, dir, n, state, name = NAME) {
  const found = judgementLines(r).filter((l) => l.startsWith(`Judgement J${n} `));
  assert.equal(found.length, 1, `one Judgement line for J${n}:\n${show(r)}`);
  assert.equal(found[0], expectedJudgement(dir, n, state, name), show(r));
}

// One Judgement line for each entry, in record order, all after the Binding lines.
export function judgementsInOrder(r, dir, name = NAME) {
  const ids = (record(dir, name).judgements ?? []).map((j) => j.id);
  const ls = out(r);
  const at = ls.map((l, i) => (l.startsWith('Judgement ') ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(at.map((i) => ls[i].split(' ')[1]), ids, `one Judgement line for each entry, in record order:\n${show(r)}`);
  const lastBinding = ls.map((l, i) => (l.startsWith('Binding   ') ? i : -1)).filter((i) => i >= 0).pop();
  if (lastBinding === undefined) {
    // No Binding line: right only when the record holds no binding.
    assert.deepEqual(record(dir, name).bindings ?? [], [], `the record holds bindings, so the trace has Binding lines:\n${show(r)}`);
    return;
  }
  for (const i of at) assert.ok(i > lastBinding, `the Judgement lines come after the Binding lines:\n${show(r)}`);
}

// The parts of a Judgement line: its ID and its state.
export function judgementStates(r) {
  return judgementLines(r).map((l) => {
    const m = /^Judgement (J\d+) .*\(\S+:\d+\): (.*); reason: /.exec(l);
    assert.ok(m, `a Judgement line in the agreed form: ${l}`);
    return { id: m[1], state: m[2] };
  });
}

// --- the Binding lines

const sha12 = (x) => String(x).slice(0, 12);
export function expectedBinding(b, state) {
  const version = b.target_version === undefined ? '' : ` version ${b.target_version}`;
  const judged = b.judged_target_sha256 === undefined ? '' : ` judged target ${sha12(b.judged_target_sha256)}`;
  const judgement = b.judgement === undefined ? '' : ` judgement ${b.judgement}`;
  return `Binding   ${b.holder} ${b.link} ${b.target}${version} target ${sha12(b.target_sha256)} holder ${sha12(b.holder_sha256)}${judged}${judgement}: ${state}`;
}
export function hasBinding(r, b, state) {
  const want = expectedBinding(b, state);
  assert.ok(out(r).includes(want), `the line "${want}":\n${show(r)}`);
}
// Each binding of the record has one Binding line in the agreed form (with
// any state), and the trace has no other Binding line.
export function allBindingsShown(r, dir, name = NAME) {
  const bindings = record(dir, name).bindings ?? [];
  const ls = bindingLines(r);
  assert.equal(ls.length, bindings.length, `one Binding line for each binding:\n${show(r)}`);
  for (const b of bindings) {
    const head = expectedBinding(b, '');
    const found = ls.filter((l) => l.startsWith(head) && /^(bound|stale|target not found|cross-repo, not read here)$/.test(l.slice(head.length)));
    assert.equal(found.length, 1, `one Binding line "${head}<state>":\n${show(r)}`);
  }
}

// --- what al check says

// The <what> of each hint of al check that names <request>/J<n> as stale.
export function staleWhats(c, n, request = NAME) {
  const re = new RegExp(`the judgement ${request}/J${n} \\(\\d{4}-\\d\\d-\\d\\d\\) is stale: (.+?) changed since it`);
  return c.findings.map((f) => re.exec(f.msg)?.[1]).filter((x) => x !== undefined);
}
// Whether al check's "info judged" line lists <request>/J<n>.
export const listed = (c, n, request = NAME) =>
  judgedLines(c).some((f) => new RegExp(`(^|; )${request}/J${n} `).test(f.msg));

// The state of each Judgement line agrees with al check: a current one is on
// its "info judged" line, a stale one is named stale on a hint, and any other
// one is neither.
export function agrees(r, c, request = NAME) {
  for (const { id, state } of judgementStates(r)) {
    const n = id.slice(1);
    if (state === 'current') {
      assert.ok(listed(c, n, request), `${id} is current, so al check's info judged line lists it:\n${show(r)}\n${show(c)}`);
    } else {
      assert.ok(!listed(c, n, request), `${id} is ${state}, so al check's info judged line does not list it:\n${show(r)}\n${show(c)}`);
    }
    if (state.startsWith('stale: ')) {
      assert.ok(staleWhats(c, n, request).length > 0, `${id} is stale, so a hint of al check names it stale:\n${show(r)}\n${show(c)}`);
    } else {
      assert.deepEqual(staleWhats(c, n, request), [], `${id} is ${state}, so no hint names it stale:\n${show(c)}`);
    }
  }
}
