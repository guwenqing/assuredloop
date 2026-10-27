// #95: a hint for each signed requirement of an open change that has no
// declared link to a promise or design paragraph (requests/link-hints R1,
// signed; spec LD-49, LD-57 item 2, LD-62; DES-163). Written from the
// requirement, the architect's agreed behaviour and the public interface
// only. Nothing here reads src/ or bin/.
//
// - `al check` gives one line for each such requirement:
//   `hint no-paragraph-link requests/<name>/request.md:<line> <name>/R<n> <message>[ · cited lines: ...]`.
//   <line> is the place that `al context <name>/R<n>` shows for it.
// - It fires for each requirement R<n> of the current version of an open
//   request that is signed at its current text, when no paragraph of specs/
//   (any kind) serves <name>/R<n>, no promise paragraph (purpose, scope,
//   rule, limit, definition) or design paragraph (component, interface,
//   data, flow, choice) of an open change spec serves it (bare `serves:R<n>`
//   in its own change spec, or `serves:<name>/R<n>`), and no ADR with
//   `Status: accepted` decides it. No hint for an unsigned requirement, a
//   requirement of an archived request, or a spike's question.
// - The message starts: "<name>/R<n> has no declared paragraph link: no
//   paragraph of specs/ and no promise or design paragraph of an open change
//   spec serves it, and no accepted ADR decides it." Then " Known direct
//   links, each with the limit of its evidence: " and the links joined by
//   " · ", each with its limit; or " Known direct links: none known.". A
//   stale close line adds "; close line C<n> is stale". It holds how to
//   clear it: "Link it, record where it is met (al record <name> close --on
//   R<n> --reason <why>), or judge it (al record <name> judgement --hint
//   no-paragraph-link --on <name>/R<n> --reason <why>)".
// - The known direct links: an approach paragraph of an open change spec
//   that serves it; another kind (plan, rationale, step) that serves it; an
//   ADR that decides it and is not accepted; a declared `verifies` output in
//   a request record; and the files that cite <name>/R<n> as a whole word
//   (the files of the Cited lines of `al context <name>/R<n>`), current
//   first, then historical.
// - After the message, outside it: " · cited lines: <file> <n>, <n>; ...",
//   with every citing line.
// - The lines never say "not served", "not built", "no code" or "no test".
// - A hint in every mode: never `not ok`, and `al check --strict` keeps its
//   exit code. `al context <name>` shows it under Hints.
// - It clears by a declared link, by a current close line (`al record
//   <name> close --on R<n> ...`), or by a judgement (`al record <name>
//   judgement --hint no-paragraph-link --on <name>/R<n> ...`). A close line
//   goes stale when a spec paragraph that its reason names changes. A
//   judgement keeps the message, not the cited lines: a citing line that
//   moves keeps it current; a new citing file makes it stale, and the hint
//   ends with "; the judgement <name>/J<n> (<date>) is stale: ...".
// - When the sign-off cannot be checked (originals kept outside, no place
//   set), no hint, and the Not known line names the requirement.
// - `al context <ID>`: the Linked line lists the paragraphs that build on,
//   explain or illustrate the ID (built in #229; one test confirms it).
//
// Each "no hint" test has a control in the same fixture that fires.
// No model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, findings } from './helpers/invoicer.js';
import {
  DAY, INVOICES, al, appendSection, baseProject, commitAll, doc, editFile, editRecord, editRequest, git, index, move,
  newRequest, ok, organized, project, read, req, show, write, writeConfig,
} from './helpers/project.js';
import { lines, view, word } from './helpers/views.js';

const CODE = 'no-paragraph-link';
const NAME = 'share';
const SPEC = 'specs/invoices.md';
const CS = `requests/${NAME}/spec.md`;
const SOURCE = 'email from the owner, 2026-05-04';
const T12 = 'An invoice has a number, a customer, lines, a total and a paid date.';

const R = (n, body) => req(`R${n}`, `Requirement ${n}`, body);
const R1 = R(1, 'A shared export link MUST live for 24 hours.');
const R2 = R(2, 'A reminder email MUST go out 7 days after the due date.');
const R3 = R(3, 'The export SHOULD show the total of the month.');

// --- fixtures

const claim = (name = NAME) => `Tier: 2 — ${name}`;

// index, then commit, as the author does at each step.
function save(dir, message = `${NAME}: work`) {
  index(dir);
  commitAll(dir, `${message}\n\n${claim()}`);
}

const sign = (dir, name, words = 'Yes, sign it', env = {}) =>
  ok(dir, ['record', name, 'signoff', '--source', SOURCE, '--words', words, '--yes'], { env });

// A request of tier 2 with its organized requirements, signed unless
// `signed` is false, and its change spec from `paras` ([marker, text] pairs).
function request(dir, name, reqs, paras, { signed = true, tier = '2', heading } = {}) {
  newRequest(dir, name, `The owner wants ${name}.\n`, ['--tier', tier]);
  appendSection(dir, name, organized(reqs, heading ? { heading } : {}));
  if (signed) sign(dir, name);
  if (paras) write(dir, `requests/${name}/spec.md`, doc(paras));
}

// main: config, specs/invoices.md and ADR-3 (baseProject); then the branch
// feature with the open request share and the requirements `reqs`, signed,
// and its change spec. Indexed and committed.
function world(t, reqs, paras = [['SP-9 plan', 'One PR for the whole change.']]) {
  const dir = baseProject(t);
  request(dir, NAME, reqs, paras);
  save(dir, `${NAME}: the request`);
  return dir;
}

// Appends paragraphs to specs/invoices.md.
const addToSpec = (dir, paras) => write(dir, SPEC, `${read(dir, SPEC).replace(/\n*$/, '\n')}\n${doc(paras)}`);

// Concludes a request by hand: the folder moves to requests/archive/, and the
// record and the header say concluded.
function archive(dir, name) {
  editFile(dir, `requests/${name}/request.md`, 'Status: open', 'Status: concluded');
  move(dir, `requests/${name}`, `requests/archive/${name}`);
  editRecord(dir, name, (rec) => { rec.status = 'concluded'; });
}

// An ADR file with its status line, a head paragraph that decides `decides`,
// and a rationale.
function adr(dir, n, status, decides, title) {
  const file = `specs/adr/000${n}-adr-${n}.md`;
  write(dir, file, `Status: ${status}\n\n${doc([
    [`ADR-${n} choice decides:${decides}`, `# ADR-${n}: ${title}`],
    [`ADR-${n}-1 rationale`, `Context: ${title.toLowerCase()} need one decision.`],
  ])}`);
  return { file, heading: `# ADR-${n}: ${title}` };
}

// The 1-based line of the exact line `text` in a file.
function lineOf(dir, file, text) {
  const at = read(dir, file).split('\n').indexOf(text);
  assert.ok(at >= 0, `${file} has the line ${JSON.stringify(text)}`);
  return at + 1;
}
const place = (dir, file, text) => `${file}:${lineOf(dir, file, text)}`;

// The line numbers of a file that name the ID as a whole word.
const citing = (dir, file, id) => read(dir, file).split('\n').map((l, i) => (word(id).test(l) ? i + 1 : 0)).filter((n) => n > 0);

// --- reading the output

const hints = (r, id) => r.findings.filter((f) => f.code === CODE && (id === undefined || f.id === id));

const FORBIDDEN = /not served|not built|no code|no test/i;
function cleanWords(line, r) {
  assert.doesNotMatch(line, FORBIDDEN, `never "not served", "not built", "no code" or "no test":\n${line}\n${show(r)}`);
}

// The one hint on id: a hint, never not ok, in the plain words.
function oneHint(r, id) {
  const found = hints(r, id);
  assert.equal(found.length, 1, `one "hint ${CODE} ... ${id}" line:\n${show(r)}`);
  assert.equal(found[0].severity, 'hint', show(r));
  cleanWords(found[0].line, r);
  return found[0];
}
function noHint(r, id) {
  assert.deepEqual(hints(r, id).map((f) => f.line), [], `no ${CODE} on ${id}:\n${show(r)}`);
}

// The head line of `al context <name>/R<n>`: the requirement is signed at its
// current version, and its place in request.md.
function signedPlace(dir, id, env = {}) {
  const r = al(dir, ['context', id], { env });
  assert.equal(r.code, 0, show(r));
  const m = new RegExp(`^Requirement ${id.replace('/', '\\/')} version \\d+ · signed in S\\d+ · (\\S+):(\\d+): `, 'm').exec(r.stdout);
  assert.ok(m, `the fixture: ${id} is signed at its current version:\n${show(r)}`);
  return { file: m[1], at: Number(m[2]) };
}

// The Cited lines of `al context <id>`, as {group, file, ns}; none for
// `Cited     nowhere`.
function citedOf(dir, id) {
  const r = al(dir, ['context', id]);
  assert.equal(r.code, 0, show(r));
  return lines(r).filter((l) => l.startsWith('Cited     ') && l !== 'Cited     nowhere').map((l) => {
    const m = /^Cited {5}(current|historical) (\S+): \d+ lines?: ([\d, ]+)$/.exec(l);
    assert.ok(m, `a Cited line in its form: ${l}\n${show(r)}`);
    return { group: m[1], file: m[2], ns: m[3].split(', ').map(Number) };
  });
}

const HEAD = (id) =>
  `${id} has no declared paragraph link: no paragraph of specs/ and no promise or design paragraph of an open change spec serves it, and no accepted ADR decides it.`;
const KNOWN = ' Known direct links, each with the limit of its evidence: ';
const NONE_KNOWN = ' Known direct links: none known.';
const CLEAR = (name, n) =>
  `Link it, record where it is met (al record ${name} close --on ${n} --reason <why>), or judge it (al record ${name} judgement --hint ${CODE} --on ${name}/${n} --reason <why>)`;

// The limit clauses of the known direct links.
const APPROACH = (id, at) => `approach ${id} (${at}) serves it, and an approach is not a design and is never in force`;
const OTHER_KIND = (kind, id, at) => `${kind} ${id} (${at}) serves it, and a ${kind} paragraph is not a promise or design paragraph`;
const ADR_LINK = (status, id, at) => `${status} ${id} (${at}) decides it, and a ${status} ADR is not in force`;
const OUTPUT = (file) => `declared output ${file} verifies it, and a declared output is a claim, never shown as proven`;
const CITED = (cites) =>
  `cited in ${cites.map((c) => `${c.group} ${c.file}`).join(', ')}, and a citation is not evidence that the code or the test does what the requirement says`;
const TAIL = (cites) => ` · cited lines: ${cites.map((c) => `${c.file} ${c.ns.join(', ')}`).join('; ')}`;

// The hint on <name>/R<n>, at the requirement's place, with the head, the
// links part and the way to clear it.
function hintOn(r, dir, name, n, { known, env } = {}) {
  const id = `${name}/${n}`;
  const at = signedPlace(dir, id, env);
  const f = oneHint(r, id);
  assert.equal(f.file, at.file, `the hint is at the requirement's place:\n${f.line}\n${show(r)}`);
  assert.equal(f.at, at.at, `the hint is at the requirement's line:\n${f.line}\n${show(r)}`);
  if (known === 'none') {
    assert.ok(f.msg.startsWith(HEAD(id) + NONE_KNOWN), `the message starts with the head and "none known":\n${f.line}\n${show(r)}`);
  } else {
    assert.ok(f.msg.startsWith(HEAD(id) + KNOWN), `the message starts with the head and the known links:\n${f.line}\n${show(r)}`);
  }
  assert.ok(f.msg.includes(CLEAR(name, n)), `the message says how to clear it:\n${f.line}\n${show(r)}`);
  return f;
}

// =====================================================================
// 5. No link: the hint, "none known"

test('#95 no link: share/R1 signed, the change spec has only a plan that serves nothing, nothing cites it: one hint at R1\'s place, "none known", and no cited lines', (t) => {
  const dir = world(t, [R1]);
  assert.deepEqual(citedOf(dir, `${NAME}/R1`), [], 'the fixture: nothing cites share/R1');
  const r = check(dir);
  const f = hintOn(r, dir, NAME, 'R1', { known: 'none' });
  assert.ok(!f.line.includes(' · cited lines:'), `no cited lines:\n${f.line}`);
  assert.ok(!f.msg.includes('stale'), `nothing is stale:\n${f.line}`);
});

// =====================================================================
// 1. Direct output links only: citations

// share/R1 cited on 14 lines of src/a.js, once in test/a.test.js, and twice
// in the archived request old (historical). Nothing declares a link.
const A_JS = Array.from({ length: 20 }, (_, i) => ((i + 1) % 3 === 0 ? `// step ${i + 1}` : `// share/R1 step ${i + 1}`)).join('\n');
function citedWorld(t) {
  const dir = baseProject(t);
  newRequest(dir, 'old');
  write(dir, 'requests/old/request.md', `${read(dir, 'requests/old/request.md')}\nThe old export led to share/R1.\nshare/R1 keeps it.\n`);
  index(dir);
  archive(dir, 'old');
  request(dir, NAME, [R1], [['SP-9 plan', 'One PR for the whole change.']]);
  write(dir, 'src/a.js', `${A_JS}\n`);
  write(dir, 'test/a.test.js', "import '../src/a.js';\n// checks share/R1\n");
  save(dir, `${NAME}: the request`);
  return dir;
}
const CITES = (dir) => [
  { group: 'current', file: 'src/a.js', ns: citing(dir, 'src/a.js', 'share/R1') },
  { group: 'current', file: 'test/a.test.js', ns: citing(dir, 'test/a.test.js', 'share/R1') },
  { group: 'historical', file: 'requests/archive/old/request.md', ns: citing(dir, 'requests/archive/old/request.md', 'share/R1') },
];

test('#95 citations only: the hint names each citing file (current first, then historical) with its limit, and after the message every citing line', (t) => {
  const dir = citedWorld(t);
  const cites = CITES(dir);
  assert.equal(cites[0].ns.length, 14, 'the fixture: src/a.js cites share/R1 on 14 lines');
  assert.deepEqual(citedOf(dir, `${NAME}/R1`), cites, 'the fixture: al context share/R1 shows these Cited lines');
  const r = check(dir);
  const f = hintOn(r, dir, NAME, 'R1');
  assert.ok(f.msg.includes(CITED(cites)), `the citations, by file, with their limit:\n${CITED(cites)}\n${f.line}\n${show(r)}`);
  const tail = TAIL(cites);
  assert.ok(f.msg.includes(tail), `every citing line, after the message:\n${tail}\n${f.line}\n${show(r)}`);
  assert.ok(f.msg.indexOf(tail) > f.msg.indexOf(CLEAR(NAME, 'R1')), `the cited lines come after the message:\n${f.line}`);
  assert.doesNotMatch(f.line, /\bmore\b/i, `no line is left out:\n${f.line}`);
});

// =====================================================================
// 2. An existing design reused: a paragraph of specs/ serves it

test('#95 an existing design reused: a component and a rationale of specs/ serve share/R1 and share/R2: no hint on them; R3 with none gets one', (t) => {
  const dir = world(t, [R1, R2, R3]);
  addToSpec(dir, [
    ['INV-50 component serves:share/R1 builds-on:INV-41', 'The link store keeps each shared link for one day.'],
    ['INV-51 rationale serves:share/R2', 'Owners forget due dates, so a reminder helps.'],
  ]);
  save(dir, `${NAME}: INV-50, INV-51`);
  const r = check(dir);
  noHint(r, `${NAME}/R1`);
  noHint(r, `${NAME}/R2`);
  hintOn(r, dir, NAME, 'R3', { known: 'none' });
});

// =====================================================================
// 3. An ADR only

test('#95 ADR only: an accepted ADR that decides share/R1 clears it; a proposed ADR that decides share/R2 does not, and the hint names it with its limit', (t) => {
  const dir = world(t, [R1, R2]);
  adr(dir, 4, 'accepted', `${NAME}/R1`, 'Shared links');
  const a5 = adr(dir, 5, 'proposed', `${NAME}/R2`, 'Reminders');
  save(dir, `${NAME}: ADR-4, ADR-5`);
  const r = check(dir);
  noHint(r, `${NAME}/R1`);
  const f = hintOn(r, dir, NAME, 'R2');
  const link = ADR_LINK('proposed', 'ADR-5', place(dir, a5.file, a5.heading));
  assert.ok(f.msg.includes(link), `the proposed ADR, with its limit:\n${link}\n${f.line}\n${show(r)}`);
});

// =====================================================================
// 4. Partial links

test('#95 partial links: R1 and R2 signed, INV-50 serves share/R1 only: the hint on share/R2 only', (t) => {
  const dir = world(t, [R1, R2]);
  addToSpec(dir, [['INV-50 rule serves:share/R1', 'A shared export link MUST live for 24 hours.']]);
  save(dir, `${NAME}: INV-50`);
  const r = check(dir);
  noHint(r, `${NAME}/R1`);
  hintOn(r, dir, NAME, 'R2', { known: 'none' });
  assert.deepEqual(hints(r).map((f) => f.id), [`${NAME}/R2`], `the only ${CODE} hint is on share/R2:\n${show(r)}`);
});

// =====================================================================
// 6. The change spec: promise and design paragraphs clear it; an approach
// or another kind is a known link, named with its limit

const KINDS = ['purpose', 'scope', 'rule', 'limit', 'definition', 'component', 'interface', 'data', 'flow', 'choice'];
const OTHERS = ['plan', 'rationale', 'step'];

// share: R1-R10 each served by one promise or design kind (bare serves:R<n>);
// R11 served by an approach; R12-R14 by plan, rationale and step; R15 served
// by a component of the open request other (serves:share/R15).
function kindsWorld(t) {
  const reqs = Array.from({ length: 15 }, (_, i) => R(i + 1, `The export MUST do thing ${i + 1}.`));
  const paras = [
    ...KINDS.map((k, i) => [`SP-${i + 1} ${k} serves:R${i + 1}`, `The ${k} paragraph number ${i + 1}.`]),
    ['SP-11 approach serves:R11', 'Reuse the export link of today.'],
    ...OTHERS.map((k, i) => [`SP-${i + 12} ${k} serves:R${i + 12}`, `The ${k} paragraph number ${i + 12}.`]),
  ];
  const dir = baseProject(t);
  request(dir, NAME, reqs, paras);
  request(dir, 'other', [R(1, 'Another export MUST exist.')], [['SP-1 component serves:share/R15', 'The shared exporter serves both requests.']]);
  save(dir, 'share and other');
  return dir;
}

test('#95 a promise or design paragraph of the change spec that serves it clears it (each of the ten kinds, bare and qualified serves); the approach and other kinds do not', (t) => {
  const dir = kindsWorld(t);
  const r = check(dir);
  for (let n = 1; n <= 10; n++) noHint(r, `${NAME}/R${n}`);
  noHint(r, `${NAME}/R15`);
  for (let n = 11; n <= 14; n++) hintOn(r, dir, NAME, `R${n}`);
  assert.deepEqual(hints(r).map((f) => f.id).sort(), [11, 12, 13, 14].map((n) => `${NAME}/R${n}`).sort(), `exactly R11-R14:\n${show(r)}`);
});

test('#95 an approach that serves share/R11 is named with "an approach is not a design and is never in force"; plan, rationale and step each with "a <kind> paragraph is not a promise or design paragraph"', (t) => {
  const dir = kindsWorld(t);
  const r = check(dir);
  const sp11 = APPROACH(`${NAME}/SP-11`, place(dir, CS, 'Reuse the export link of today.'));
  const f11 = hintOn(r, dir, NAME, 'R11');
  assert.ok(f11.msg.includes(sp11), `the approach, with its limit:\n${sp11}\n${f11.line}\n${show(r)}`);
  OTHERS.forEach((k, i) => {
    const n = i + 12;
    const link = OTHER_KIND(k, `${NAME}/SP-${n}`, place(dir, CS, `The ${k} paragraph number ${n}.`));
    const f = hintOn(r, dir, NAME, `R${n}`);
    assert.ok(f.msg.includes(link), `the ${k}, with its limit:\n${link}\n${f.line}\n${show(r)}`);
  });
});

// =====================================================================
// A declared verifies output in a request record

test('#95 a declared output that verifies share/R1 is named with "a declared output is a claim, never shown as proven"', (t) => {
  const dir = world(t, [R1]);
  write(dir, 'test/links.test.js', "import '../src/links.js';\n");
  index(dir);
  editRecord(dir, NAME, (rec) => { rec.outputs = [{ file: 'test/links.test.js', verifies: [`${NAME}/R1`] }]; });
  save(dir, `${NAME}: the test`);
  const r = check(dir);
  const f = hintOn(r, dir, NAME, 'R1');
  assert.ok(f.msg.includes(OUTPUT('test/links.test.js')), `the declared output, with its limit:\n${f.line}\n${show(r)}`);
});

// =====================================================================
// 7. Unsigned, changed after the sign-off, archived, a spike

test('#95 unsigned: share/R2 added after the sign-off, and draft/R1 never signed: no hint on them; share/R1 signed gets one', (t) => {
  const dir = world(t, [R1]);
  editRequest(dir, NAME, R1.block, `${R1.block}\n${R2.block}`);
  request(dir, 'draft', [R1], null, { signed: false });
  save(dir, 'R2 and draft');
  const r = check(dir);
  noHint(r, `${NAME}/R2`);
  noHint(r, 'draft/R1');
  hintOn(r, dir, NAME, 'R1', { known: 'none' });
});

test('#95 signed, then its text changed: share/R2 is not signed at its current text: no hint on it; share/R1 gets one', (t) => {
  const dir = world(t, [R1, R2]);
  editRequest(dir, NAME, 'MUST go out 7 days', 'MUST go out 3 days');
  save(dir, `${NAME}: R2 changed`);
  const r = check(dir);
  noHint(r, `${NAME}/R2`);
  hintOn(r, dir, NAME, 'R1', { known: 'none' });
});

test('#95 an archived request: done/R1, signed and with no link, gets no hint; share/R1 in the same state gets one', (t) => {
  const dir = baseProject(t);
  request(dir, 'done', [R1], [['SP-9 plan', 'One PR.']]);
  index(dir);
  archive(dir, 'done');
  request(dir, NAME, [R1], [['SP-9 plan', 'One PR.']]);
  save(dir, 'done and share');
  const r = check(dir);
  noHint(r, 'done/R1');
  assert.deepEqual(r.findings.filter((f) => f.code === CODE && f.file.includes('archive')).map((f) => f.line), [], show(r));
  hintOn(r, dir, NAME, 'R1', { known: 'none' });
});

const SPIKE_Q = { id: 'Q1', block: '<!-- Q1 -->\n\n### Q1 Signed links\nCan a signed link replace the token table?\n' };

test('#95 a spike: its signed question Q1, with no link, gets no hint; share/R1 in the same state gets one', (t) => {
  const dir = baseProject(t);
  request(dir, 'spike-a', [SPIKE_Q], [['SP-1 approach serves:Q1', 'Try an HMAC over the invoice ID.']], { tier: 'S', heading: '## Organized question' });
  request(dir, NAME, [R1], [['SP-9 plan', 'One PR.']]);
  save(dir, 'spike-a and share');
  const r = check(dir);
  assert.deepEqual(r.findings.filter((f) => f.code === CODE && f.id.startsWith('spike-a/')).map((f) => f.line), [], `no hint on the spike:\n${show(r)}`);
  hintOn(r, dir, NAME, 'R1', { known: 'none' });
});

// =====================================================================
// 8. The close line

const MET_BY = 'Met by INV-12, which is reused; no new paragraph is needed.';

// The fixture: al context share shows the close line C1 on R1 in the state
// (current or stale), as #72 built it.
function closeLineIs(dir, state) {
  const r = ok(dir, ['context', NAME]);
  const found = lines(r).filter((l) => /\bclose\b/.test(l) && word('C1').test(l) && word('R1').test(l) && l.includes(MET_BY));
  assert.equal(found.length, 1, `the fixture: one close line C1 on R1:\n${show(r)}`);
  assert.match(found[0].replace(MET_BY, ''), new RegExp(`\\b${state}\\b`), `the fixture: C1 is ${state}:\n${show(r)}`);
}

test('#95 a current close line on R1 clears the hint; when INV-12, which its reason names, changes, the hint comes back with "; close line C1 is stale"', (t) => {
  const dir = world(t, [R1, R2]);
  const before = check(dir);
  hintOn(before, dir, NAME, 'R1', { known: 'none' });
  ok(dir, ['record', NAME, 'close', '--on', 'R1', '--reason', MET_BY, '--yes']);
  save(dir, `${NAME}: C1`);
  closeLineIs(dir, 'current');
  const cleared = check(dir);
  noHint(cleared, `${NAME}/R1`);
  hintOn(cleared, dir, NAME, 'R2', { known: 'none' }); // control: R2 has no close line
  assert.ok(!hints(cleared, `${NAME}/R2`)[0].msg.includes('close line'), show(cleared));

  editFile(dir, SPEC, T12, 'An invoice has a number, a customer, a currency, lines, a total and a paid date.');
  save(dir, `${NAME}: INV-12 changed`);
  closeLineIs(dir, 'stale');
  const r = check(dir);
  const f = hintOn(r, dir, NAME, 'R1');
  assert.ok(f.msg.includes('; close line C1 is stale'), `the hint names C1 as stale:\n${f.line}\n${show(r)}`);
});

// =====================================================================
// 9. The judgement

const WHY = 'The link rule of INV-41 meets it; the review read src/a.js.';
const STALE = `; the judgement ${NAME}/J1 (${DAY}) is stale: `;

function judgedWorld(t) {
  const dir = world(t, [R1, R2]);
  write(dir, 'src/a.js', '// share/R1: the link lives one day\nexport const day = 24;\n');
  save(dir, `${NAME}: src/a.js`);
  return dir;
}
const judge = (dir) => ok(dir, ['record', NAME, 'judgement', '--hint', CODE, '--on', `${NAME}/R1`, '--reason', WHY, '--yes']);

test('#95 a judgement on share/R1 clears the hint, and al check names it on its info judged line; R2 keeps its hint', (t) => {
  const dir = judgedWorld(t);
  hintOn(check(dir), dir, NAME, 'R1');
  judge(dir);
  save(dir, `${NAME}: J1`);
  const r = check(dir);
  noHint(r, `${NAME}/R1`);
  hintOn(r, dir, NAME, 'R2', { known: 'none' });
  const judged = r.findings.filter((f) => f.severity === 'info' && f.code === 'judged');
  assert.equal(judged.length, 1, show(r));
  assert.ok(judged[0].msg.includes(`${NAME}/J1 ${CODE} ${NAME}/R1: ${WHY}`), `the info judged line names J1:\n${show(r)}`);
});

test('#95 a judgement stays current when a citing line only moves (src/a.js still cites share/R1, two lines lower)', (t) => {
  const dir = judgedWorld(t);
  hintOn(check(dir), dir, NAME, 'R1');
  judge(dir);
  save(dir, `${NAME}: J1`);
  write(dir, 'src/a.js', `// the link module\n\n${read(dir, 'src/a.js')}`);
  save(dir, `${NAME}: src/a.js moved`);
  assert.deepEqual(citedOf(dir, `${NAME}/R1`), [{ group: 'current', file: 'src/a.js', ns: [3] }], 'the fixture: the citing line moved to line 3');
  const r = check(dir);
  noHint(r, `${NAME}/R1`);
  hintOn(r, dir, NAME, 'R2', { known: 'none' }); // control
});

test('#95 a new citing file makes the judgement stale: the hint comes back, names src/b.js, and ends with "the judgement share/J1 (<date>) is stale: ..."', (t) => {
  const dir = judgedWorld(t);
  hintOn(check(dir), dir, NAME, 'R1');
  judge(dir);
  save(dir, `${NAME}: J1`);
  write(dir, 'src/b.js', '// share/R1: the reminder of a link\n');
  save(dir, `${NAME}: src/b.js`);
  const r = check(dir);
  const f = hintOn(r, dir, NAME, 'R1');
  const cites = [
    { group: 'current', file: 'src/a.js', ns: [1] },
    { group: 'current', file: 'src/b.js', ns: [1] },
  ];
  assert.ok(f.msg.includes(CITED(cites)), `the hint names both citing files:\n${f.line}\n${show(r)}`);
  assert.ok(f.msg.includes(STALE), `the hint names J1 as stale:\n${f.line}\n${show(r)}`);
  assert.match(f.msg, /is stale: .+ changed since it/, `it says what changed since the judgement:\n${f.line}`);
});

// =====================================================================
// 10. --strict, and 11. the words

// A project where nothing else is not ok: its specs hold only note
// paragraphs, and share/R1 is signed with no link.
function strictWorld(t) {
  const dir = project(t);
  writeConfig(dir);
  write(dir, SPEC, doc([['INV-1 note', '# Invoices'], ['INV-2 note', 'This file holds the invoice promises.']]));
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  request(dir, NAME, [R1], [['SP-1 approach serves:R1', 'Reuse the export link of today.']]);
  write(dir, 'src/a.js', '// share/R1\n');
  save(dir, `${NAME}: the request`);
  return dir;
}

test('#95 --strict: the hint stays a hint, no not ok anywhere, and al check and al check --strict both exit 0', (t) => {
  const dir = strictWorld(t);
  const codes = [];
  for (const args of [[], ['--strict']]) {
    const r = check(dir, ...args);
    hintOn(r, dir, NAME, 'R1');
    assert.deepEqual(r.findings.filter((f) => f.severity === 'not ok').map((f) => f.line), [], `nothing is not ok:\n${show(r)}`);
    assert.ok(!r.stdout.split('\n').some((l) => l.startsWith(`not ok ${CODE} `)), show(r));
    assert.equal(r.code, 0, show(r));
    codes.push(r.code);
  }
  assert.deepEqual(codes, [0, 0]);
});

test('#95 the words: with every kind of known link on share/R1, the hint and the Hints line of al context never say "not served", "not built", "no code" or "no test"', (t) => {
  const dir = world(t, [R1], [
    ['SP-1 approach serves:R1', 'Reuse the export link of today.'],
    ['SP-2 plan serves:R1', 'One PR for the link.'],
  ]);
  const a4 = adr(dir, 4, 'proposed', `${NAME}/R1`, 'Shared links');
  write(dir, 'src/a.js', '// share/R1\n');
  write(dir, 'test/a.test.js', '// share/R1\n');
  index(dir);
  editRecord(dir, NAME, (rec) => { rec.outputs = [{ file: 'test/a.test.js', verifies: [`${NAME}/R1`] }]; });
  save(dir, `${NAME}: every link`);
  const want = [
    APPROACH(`${NAME}/SP-1`, place(dir, CS, 'Reuse the export link of today.')),
    OTHER_KIND('plan', `${NAME}/SP-2`, place(dir, CS, 'One PR for the link.')),
    ADR_LINK('proposed', 'ADR-4', place(dir, a4.file, a4.heading)),
    OUTPUT('test/a.test.js'),
    CITED([{ group: 'current', file: 'src/a.js' }, { group: 'current', file: 'test/a.test.js' }]),
  ];
  for (const args of [[], ['--strict'], ['--full']]) {
    const r = check(dir, ...args);
    const f = hintOn(r, dir, NAME, 'R1');
    for (const link of want) assert.ok(f.msg.includes(link), `the known link, with its limit:\n${link}\n${f.line}\n${show(r)}`);
  }
  const c = ok(dir, ['context', NAME]);
  const shown = lines(c).filter((l) => l.includes(` ${CODE} `));
  assert.equal(shown.length, 1, show(c));
  cleanWords(shown[0], c);
});

// =====================================================================
// 12. al context <name>: the Hints section; al context <ID>: Linked

// The Hints section of `al context <name>`: the lines right after
// `Hints     <n>` that start with two spaces, without those spaces.
function hintsSection(r) {
  const ls = lines(r);
  const at = ls.findIndex((l) => l.startsWith('Hints     '));
  assert.ok(at >= 0, `a Hints line:\n${show(r)}`);
  const out = [];
  for (let i = at + 1; i < ls.length && ls[i].startsWith('  '); i++) out.push(ls[i].slice(2));
  return out;
}

test('#95 al context share shows the hint under Hints, as the line that al check gives', (t) => {
  const dir = citedWorld(t);
  const c = check(dir);
  const f = oneHint(c, `${NAME}/R1`);
  const r = ok(dir, ['context', NAME]);
  assert.ok(hintsSection(r).includes(f.line), `the Hints section holds al check's line:\n${f.line}\n${show(r)}`);
});

test('#95 al context INV-12: the Linked line lists the paragraphs that build on, explain or illustrate it', (t) => {
  const dir = world(t, [R1]);
  addToSpec(dir, [
    ['INV-70 rationale explains:INV-12', 'The paid date tells the export which month an invoice is in.'],
    ['INV-71 example illustrates:INV-12', 'Invoice 2026-0042, two lines, total 120.00, paid 2026-04-30.'],
    ['INV-72 component serves:share/R1 builds-on:INV-12', 'The month reader loads the invoices of the month.'],
  ]);
  save(dir, `${NAME}: INV-70 to INV-72`);
  const r = view(dir, ['context', 'INV-12']);
  const found = lines(r).filter((l) => l.startsWith('Linked    '));
  assert.equal(found.length, 1, show(r));
  assert.deepEqual(found[0].slice(10).split(' · ').sort(), [
    `INV-70 (${place(dir, SPEC, 'The paid date tells the export which month an invoice is in.')}) explains it`,
    `INV-71 (${place(dir, SPEC, 'Invoice 2026-0042, two lines, total 120.00, paid 2026-04-30.')}) illustrates it`,
    `INV-72 (${place(dir, SPEC, 'The month reader loads the invoices of the month.')}) builds on it`,
  ].sort(), show(r));
});

// =====================================================================
// The sign-off cannot be checked: originals kept outside, no place set

function tmp(t, prefix) {
  const d = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
// A worker's config folder; with a folder, a places line for the name.
function worker(t, folder) {
  const xdg = tmp(t, 'al-xdg-');
  if (folder !== undefined) {
    mkdirSync(join(xdg, 'assuredloop'), { recursive: true });
    writeFileSync(join(xdg, 'assuredloop', 'places.yaml'), `outside-test: ${JSON.stringify(folder)}\n`);
  }
  return { XDG_CONFIG_HOME: xdg, HOME: xdg };
}

test('#95 originals kept outside: with the place set, share/R1 is signed and gets the hint; with no place set, no hint, and Not known names share/R1', (t) => {
  const A = worker(t, tmp(t, 'al-place-'));
  const none = worker(t);
  const dir = project(t);
  writeConfig(dir, [{ file: SPEC, prefix: 'INV' }], { originals: { outside: 'outside-test' } });
  write(dir, SPEC, INVOICES);
  commitAll(dir, 'base');
  git(dir, 'checkout', '-q', '-b', 'feature');
  ok(dir, ['new', NAME, '--from', '-', '--tier', '2'], { input: 'The owner wants shared links.\n', env: A });
  appendSection(dir, NAME, organized([R1]));
  sign(dir, NAME, 'Yes, sign it', A);
  write(dir, CS, doc([['SP-9 plan', 'One PR.']]));
  ok(dir, ['index'], { env: A });
  commitAll(dir, `${NAME}: the request\n\n${claim()}`);

  const withEnv = (env) => {
    const run = al(dir, ['check'], { env });
    return { ...run, findings: findings(run.stdout) };
  };
  hintOn(withEnv(A), dir, NAME, 'R1', { known: 'none', env: A });

  const r = withEnv(none);
  noHint(r, `${NAME}/R1`);
  const notKnown = lines(r).find((l) => l.startsWith('Not known')) ?? '';
  assert.ok(word(`${NAME}/R1`).test(notKnown), `Not known names share/R1:\n${show(r)}`);
});
