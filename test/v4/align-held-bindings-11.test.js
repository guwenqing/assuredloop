// #11 (third part): al index --align moves the bindings that a superseded ADR
// holds. SCH-22 (specs/schema.md, section 5): "After an accepted or
// superseded ADR is rewritten, `al index --align <ID>` advances the bindings
// that paragraph `<ID>` holds to it, as for any other target."
//
// The case of #11: ADR-4 is bound while its marker is `decides:INV-13
// source:inv/D1 supersedes:ADR-3`, so the record of the open request inv
// holds its bindings. Then ADR-4 becomes `Status: superseded by ADR-5`, its
// marker drops `source:inv/D1`, and its heading is reworded. `al index
// --align ADR-4` moves each binding that ADR-4 still declares (decides
// INV-13, supersedes ADR-3) to the current holder and target hashes, in the
// record that holds it, with an `aligned:` line for each.
//
// The general form: any paragraph whose marker no longer names a request,
// but whose bindings an open request's record holds. Here a specs/ paragraph
// (INV-60) and an accepted ADR (ADR-6), both held by the request other.
//
// Controls: an accepted ADR that keeps its source aligns; a superseded ADR
// that keeps its source aligns; plain al index moves none of these bindings;
// aligning one holder leaves every other holder's bindings as they were; a
// binding whose link the holder no longer declares is not changed by
// --align. Nothing here reads the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  appendSection, baseProject, bindingsOf, commitAll, doc, editFile, hashOf, index, newRequest, ok, organized, read,
  record, req, show, write,
} from './helpers/project.js';

const SPEC = 'specs/invoices.md';
const CS = 'requests/inv/spec.md';
const ADR3 = 'specs/adr/0003-signed-links.md';
const ADR4 = 'specs/adr/0004-line-rules.md';
const ADR5 = 'specs/adr/0005-line-checks.md';
const ADR6 = 'specs/adr/0006-invoice-data.md';
const ADR7 = 'specs/adr/0007-link-expiry.md';

const INV13 = 'An invoice MUST have at least one line.';
const INV13b = 'An invoice MUST have at least one line with an amount.';
const INV12 = 'An invoice has a number, a customer, lines, a total and a paid date.';
const INV12b = 'An invoice has a unique number, a customer, lines, a total and a paid date.';
const INV60 = 'A credit note MUST have at least one line.';
const INV60b = 'Each credit note MUST have at least one line.';

const adr = (status, marker, heading) => `Status: ${status}\n\n${doc([[marker, heading]])}`;

// The file that holds the text of each paragraph ID.
const DOC_OF = {
  'ADR-3': ADR3, 'ADR-4': ADR4, 'ADR-5': ADR5, 'ADR-6': ADR6, 'ADR-7': ADR7,
  'INV-12': SPEC, 'INV-13': SPEC, 'INV-41': SPEC, 'INV-60': SPEC, 'inv/SP-1': CS,
};
const hashNow = (dir, id) => hashOf(dir, DOC_OF[id], id.replace(/^inv\//, ''));

// main: config, specs/invoices.md, ADR-3. Branch feature: the open requests
// inv and other, each with R1 and D1. ADR-4 (accepted, source inv/D1,
// supersedes ADR-3), ADR-7 (accepted, source inv/D1), the change spec
// paragraph inv/SP-1; ADR-6 (accepted, source other/D1) and the specs/
// paragraph INV-60 (serves other/R1). Indexed and committed.
function linked(t) {
  const dir = baseProject(t);
  newRequest(dir, 'inv');
  appendSection(dir, 'inv', organized([req('R1', 'Monthly CSV download', 'A user MUST be able to download one month as one CSV file.')]));
  ok(dir, ['record', 'inv', 'decision', '--source', 'owner', '--text', 'Lines are checked on export.', '--clarifies', 'R1', '--yes']);
  newRequest(dir, 'other');
  appendSection(dir, 'other', organized([req('R1', 'Credit notes', 'A user MUST be able to issue a credit note.')]));
  ok(dir, ['record', 'other', 'decision', '--source', 'owner', '--text', 'A credit note is an invoice.', '--clarifies', 'R1', '--yes']);
  write(dir, CS, doc([['SP-1 rule serves:R1 builds-on:INV-13', 'An export MUST hold one row per invoice line.']]));
  write(dir, SPEC, `${read(dir, SPEC)}\n${doc([['INV-60 rule serves:other/R1 builds-on:INV-13', INV60]])}`);
  write(dir, ADR4, adr('accepted', 'ADR-4 choice decides:INV-13 source:inv/D1 supersedes:ADR-3', '# ADR-4: Line rules'));
  write(dir, ADR6, adr('accepted', 'ADR-6 choice decides:INV-12 source:other/D1', '# ADR-6: Invoice data'));
  write(dir, ADR7, adr('accepted', 'ADR-7 choice decides:INV-41 source:inv/D1', '# ADR-7: Link expiry'));
  index(dir);
  commitAll(dir, 'The requests inv and other, and their links');
  return dir;
}

// The change. ADR-4 is superseded by the new ADR-5, drops source:inv/D1 and
// is reworded. INV-60 drops serves:other/R1 and is reworded. ADR-6 drops
// source:other/D1 and is reworded. ADR-7 is reworded and keeps its links.
// The targets INV-13 and INV-12 change too.
function supersede(dir) {
  write(dir, ADR5, adr('accepted', 'ADR-5 choice decides:INV-13 source:inv/D1 supersedes:ADR-4', '# ADR-5: Line checks'));
  editFile(dir, ADR4, 'Status: accepted', 'Status: superseded by ADR-5');
  editFile(dir, ADR4, ' source:inv/D1', '');
  editFile(dir, ADR4, '# ADR-4: Line rules', '# ADR-4: Rules for invoice lines');
}
function changed(t) {
  const dir = linked(t);
  supersede(dir);
  editFile(dir, SPEC, '<!-- INV-60 rule serves:other/R1 builds-on:INV-13 -->', '<!-- INV-60 rule builds-on:INV-13 -->');
  editFile(dir, SPEC, INV60, INV60b);
  editFile(dir, ADR6, ' source:other/D1', '');
  editFile(dir, ADR6, '# ADR-6: Invoice data', '# ADR-6: The data of an invoice');
  editFile(dir, ADR7, '# ADR-7: Link expiry', '# ADR-7: When a link expires');
  editFile(dir, SPEC, INV13, INV13b);
  editFile(dir, SPEC, INV12, INV12b);
  index(dir);
  return dir;
}

// What each holder declares after the change, and what it dropped, as
// [holder, link, target], with the request whose record holds them.
const HELD = {
  'ADR-4': { rec: 'inv', declared: [['ADR-4', 'decides', 'INV-13'], ['ADR-4', 'supersedes', 'ADR-3']], dropped: [['ADR-4', 'source', 'inv/D1']] },
  'INV-60': { rec: 'other', declared: [['INV-60', 'builds-on', 'INV-13']], dropped: [['INV-60', 'serves', 'other/R1']] },
  'ADR-6': { rec: 'other', declared: [['ADR-6', 'decides', 'INV-12']], dropped: [['ADR-6', 'source', 'other/D1']] },
  'ADR-7': { rec: 'inv', declared: [['ADR-7', 'decides', 'INV-41'], ['ADR-7', 'source', 'inv/D1']], dropped: [] },
};

// Every request record, by name.
function records(dir) {
  const names = readdirSync(join(dir, '.assuredloop/records/requests')).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -5));
  return Object.fromEntries(names.map((n) => [n, record(dir, n)]));
}

const oneBinding = (rec, [holder, link, target]) => {
  const found = bindingsOf(rec, holder, link, target);
  assert.equal(found.length, 1, `one binding ${holder} ${link} ${target}; bindings:\n${stringify(rec.bindings)}`);
  return found[0];
};

// Each binding (holder, link, target) is held once, in all request records together.
function noneTwice(dir) {
  const seen = new Map();
  for (const [name, rec] of Object.entries(records(dir))) {
    for (const b of rec.bindings ?? []) {
      const key = `${b.holder} ${b.link} ${b.target}`;
      assert.ok(!seen.has(key), `${key} is held once, but ${seen.get(key)} and ${name} both hold it`);
      seen.set(key, name);
    }
  }
}

// The bindings of every holder except `holder`, record by record.
const othersOf = (dir, holder) => Object.fromEntries(Object.entries(records(dir))
  .map(([n, rec]) => [n, (rec.bindings ?? []).filter((b) => b.holder !== holder)]));

// `al index --align <holder>` moves each declared binding of holder to the
// hashes of now, in the record that holds it, with an aligned: line for each.
// The dropped bindings, and every other holder's bindings, stay as they were.
function alignMoves(dir, holder) {
  const { rec: name, declared, dropped } = HELD[holder];
  const before = record(dir, name);
  const others = othersOf(dir, holder);
  const r = ok(dir, ['index', '--align', holder]);
  const rec = record(dir, name);
  const holderNow = hashNow(dir, holder);
  for (const b of declared) {
    const got = oneBinding(rec, b);
    const old = oneBinding(before, b);
    assert.equal(got.holder_sha256, holderNow, `${b.join(' ')}: holder_sha256 is ${holder}'s text now (it was ${old.holder_sha256}):\n${show(r)}`);
    // A paragraph target: its text now. Another target (a decision): unchanged here.
    const targetNow = DOC_OF[b[2]] ? hashNow(dir, b[2]) : old.target_sha256;
    assert.equal(got.target_sha256, targetNow, `${b.join(' ')}: target_sha256 is ${b[2]}'s text now:\n${show(r)}`);
    assert.match(r.stdout, new RegExp(`^aligned: ${b.join(' ').replace(/\//g, '\\/')}\\b`, 'm'), `an aligned: line for ${b.join(' ')}:\n${show(r)}`);
  }
  for (const b of dropped) {
    assert.deepEqual(oneBinding(rec, b), oneBinding(before, b), `${b.join(' ')}, whose link ${holder} no longer declares, is not changed by --align`);
  }
  assert.doesNotMatch(r.stdout, /No record changed/, `the record ${name} changed:\n${show(r)}`);
  const othersAfter = othersOf(dir, holder);
  for (const n of Object.keys(others)) {
    assert.deepEqual(othersAfter[n], others[n], `aligning ${holder} leaves the other holders' bindings in ${n} as they were`);
  }
  noneTwice(dir);
  return r;
}

test('the world: every holder is bound in its request\'s record with its text of then; after the change each moved holder and target has another text', (t) => {
  const dir = linked(t);
  const recs = records(dir);
  for (const [holder, { rec, declared, dropped }] of Object.entries(HELD)) {
    for (const b of [...declared, ...dropped]) {
      const got = oneBinding(recs[rec], b);
      assert.equal(got.holder_sha256, hashNow(dir, holder), `${b.join(' ')} is bound with ${holder}'s text`);
      if (DOC_OF[b[2]]) assert.equal(got.target_sha256, hashNow(dir, b[2]), `${b.join(' ')} is bound with ${b[2]}'s text`);
    }
  }
  oneBinding(recs.inv, ['inv/SP-1', 'builds-on', 'INV-13']);
  noneTwice(dir);
  const bound = Object.fromEntries(Object.keys(HELD).map((h) => [h, hashNow(dir, h)]));
  const targets = { 'INV-13': hashNow(dir, 'INV-13'), 'INV-12': hashNow(dir, 'INV-12') };

  // The same project after the change: the texts did change, and plain al
  // index kept every binding as it was.
  const after = changed(t);
  for (const h of Object.keys(HELD)) assert.notEqual(hashNow(after, h), bound[h], `${h}'s text changed`);
  for (const id of Object.keys(targets)) assert.notEqual(hashNow(after, id), targets[id], `${id}'s text changed`);
  const ar = records(after);
  for (const [holder, { rec, declared }] of Object.entries(HELD)) {
    for (const b of declared) assert.equal(oneBinding(ar[rec], b).holder_sha256, bound[holder], `${b.join(' ')} still has the old holder_sha256`);
  }
  assert.match(read(after, ADR4), /^Status: superseded by ADR-5$/m);
  oneBinding(ar.inv, ['ADR-5', 'supersedes', 'ADR-4']);
});

test('#11: al index --align ADR-4, a superseded ADR whose marker dropped source:inv/D1, moves its decides INV-13 and supersedes ADR-3 bindings in inv\'s record', (t) => {
  alignMoves(changed(t), 'ADR-4');
});

test('#11: the superseded ADR-4 alone (status, dropped source, reworded heading; no other change), then --align ADR-4 moves its bindings', (t) => {
  const dir = linked(t);
  supersede(dir);
  index(dir);
  alignMoves(dir, 'ADR-4');
});

test('the general form: --align INV-60, a specs/ paragraph that dropped serves:other/R1, moves its builds-on INV-13 binding in other\'s record', (t) => {
  alignMoves(changed(t), 'INV-60');
});

test('the general form: --align ADR-6, an accepted ADR that dropped source:other/D1, moves its decides INV-12 binding in other\'s record', (t) => {
  alignMoves(changed(t), 'ADR-6');
});

test('control: --align ADR-7, an accepted ADR that keeps source:inv/D1, moves its bindings', (t) => {
  alignMoves(changed(t), 'ADR-7');
});

test('control: a superseded ADR-4 that keeps source:inv/D1 aligns its three bindings', (t) => {
  const dir = linked(t);
  write(dir, ADR5, adr('accepted', 'ADR-5 choice decides:INV-13 source:inv/D1 supersedes:ADR-4', '# ADR-5: Line checks'));
  editFile(dir, ADR4, 'Status: accepted', 'Status: superseded by ADR-5');
  editFile(dir, ADR4, '# ADR-4: Line rules', '# ADR-4: Rules for invoice lines');
  index(dir);
  const before = record(dir, 'inv');
  const r = ok(dir, ['index', '--align', 'ADR-4']);
  const rec = record(dir, 'inv');
  for (const b of [['ADR-4', 'decides', 'INV-13'], ['ADR-4', 'supersedes', 'ADR-3'], ['ADR-4', 'source', 'inv/D1']]) {
    const got = oneBinding(rec, b);
    assert.notEqual(oneBinding(before, b).holder_sha256, got.holder_sha256, `${b.join(' ')} had the old holder_sha256`);
    assert.equal(got.holder_sha256, hashNow(dir, 'ADR-4'), `${b.join(' ')}:\n${show(r)}`);
  }
  noneTwice(dir);
});

test('control: plain al index (twice) moves none of the bindings of ADR-4, INV-60, ADR-6 and ADR-7 after the change', (t) => {
  const dir = changed(t);
  const before = records(dir);
  index(dir);
  index(dir);
  assert.deepEqual(records(dir), before);
  for (const [holder, { rec, declared }] of Object.entries(HELD)) {
    for (const b of declared) assert.notEqual(oneBinding(before[rec], b).holder_sha256, hashNow(dir, holder), `${b.join(' ')} is not moved`);
  }
});

test('aligning each holder in turn: each moves its own bindings only, and no binding is held twice at the end', (t) => {
  const dir = changed(t);
  for (const holder of ['ADR-7', 'ADR-4', 'INV-60', 'ADR-6']) alignMoves(dir, holder);
  const recs = records(dir);
  for (const [holder, { rec, declared }] of Object.entries(HELD)) {
    for (const b of declared) assert.equal(oneBinding(recs[rec], b).holder_sha256, hashNow(dir, holder), `${b.join(' ')} stays aligned`);
  }
  noneTwice(dir);
});
