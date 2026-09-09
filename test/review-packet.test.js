import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commentRef,
  contentRecord,
  graph,
  graphLoader,
  outOfScopeRecord,
  refKey,
  repoRef,
  repository,
  unavailableRecord,
  workRef,
} from './fixtures/review-packet/helpers.js';

const runtimeUrl = new URL('../src/review-packet.js', import.meta.url);
let runtime;
let importError;
try {
  runtime = await import(runtimeUrl.href);
} catch (error) {
  importError = error;
}

function requireBuilder(t) {
  if (importError) {
    t.skip(`Issue #8 packet runtime is unavailable: ${importError.message}`);
    return null;
  }
  assert.equal(typeof runtime.buildReviewPacket, 'function');
  return runtime.buildReviewPacket;
}

test('review-packet module import surface is available before behavioral cases run', () => {
  assert.equal(
    importError,
    undefined,
    `Issue #8 packet runtime surface is unavailable: ${importError?.message ?? 'unknown import failure'}`,
  );
  assert.ok(runtime && typeof runtime === 'object', 'review-packet module must import as an object');
  assert.equal(typeof runtime.buildReviewPacket, 'function', 'review-packet must export buildReviewPacket');
});

function assertPageShape(page) {
  assert.ok(page && typeof page === 'object');
  assert.ok(Array.isArray(page.entries), 'packet pages expose entries');
  assert.ok(page.counts && typeof page.counts === 'object', 'packet pages expose counts');
  assert.ok(Object.hasOwn(page, 'next_cursor'), 'packet pages expose a cursor');
  assert.ok(page.limits && typeof page.limits === 'object', 'packet pages expose limits');
  assert.equal(typeof page.counts.total, 'number', 'counts.total is the stable inventory count');
}

function assertFits(page, maxInlineBytes) {
  assert.ok(
    Buffer.byteLength(JSON.stringify(page), 'utf8') + 1 <= maxInlineBytes,
    `serialized packet plus CLI newline must fit ${maxInlineBytes} UTF-8 bytes`,
  );
}

function entryFor(page, ref) {
  return page.entries.find((entry) => refKey(entry.ref) === refKey(ref));
}

function assertNoContent(entry) {
  assert.ok(entry, 'expected a packet entry');
  assert.equal(Object.hasOwn(entry, 'content'), false, 'non-inlined entries do not carry content');
}

async function collectPages(buildReviewPacket, options) {
  const pages = [];
  let cursor = null;
  for (let index = 0; index < 100; index += 1) {
    const page = await buildReviewPacket({ ...options, cursor });
    assertPageShape(page);
    pages.push(page);
    if (page.next_cursor === null) return pages;
    assert.equal(typeof page.next_cursor, 'string', 'next_cursor is a string when more pages remain');
    cursor = page.next_cursor;
  }
  assert.fail('packet pagination did not terminate within 100 pages');
}

function entryProjection(page) {
  return page.entries.map((entry) => ({
    ref: entry.ref,
    depth: entry.depth,
    disposition: entry.disposition,
    ...(Object.hasOwn(entry, 'content') ? { content: entry.content } : {}),
    ...(Object.hasOwn(entry, 'reason') ? { reason: entry.reason } : {}),
  }));
}

test('builds depth-1 context while retaining depth-2 references without loading them', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const root = repoRef('review/root.md');
  const directComment = commentRef(101);
  const directWork = workRef(7);
  const deepRef = repoRef('review/deep.md');
  const records = graph([
    [root, contentRecord('root request', [directWork, directComment])],
    [directWork, contentRecord('work record', [deepRef])],
    [directComment, contentRecord('review evidence')],
    [deepRef, contentRecord('deeper requirement')],
  ]);
  const calls = [];
  const page = await buildReviewPacket({
    roots: [root],
    load: graphLoader(records, calls),
  });

  assertPageShape(page);
  const rootEntry = entryFor(page, root);
  const directCommentEntry = entryFor(page, directComment);
  const directWorkEntry = entryFor(page, directWork);
  const deepEntry = entryFor(page, deepRef);

  assert.equal(rootEntry.depth, 0);
  assert.equal(rootEntry.disposition, 'inlined');
  assert.equal(rootEntry.content, 'root request');
  assert.equal(directCommentEntry.depth, 1);
  assert.equal(directCommentEntry.disposition, 'inlined');
  assert.equal(directCommentEntry.content, 'review evidence');
  assert.equal(directWorkEntry.depth, 1);
  assert.equal(directWorkEntry.disposition, 'inlined');
  assert.equal(directWorkEntry.content, 'work record');
  assert.equal(deepEntry.depth, 2);
  assert.equal(deepEntry.disposition, 'outside-depth');
  assertNoContent(deepEntry);
  assert.equal(calls.some((ref) => refKey(ref) === refKey(deepRef)), false, 'depth-2 content is lazy');
});

test('keeps root order and normalizes reference order independently of loader enumeration order', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const firstRoot = workRef(22);
  const secondRoot = repoRef('review/second.md');
  const directA = repoRef('review/a.md');
  const directB = commentRef(202);
  const directC = workRef(23);
  const recordsA = graph([
    [firstRoot, contentRecord('first', [directC, directA, directB])],
    [secondRoot, contentRecord('second', [directB, directA])],
    [directA, contentRecord('a')],
    [directB, contentRecord('b')],
    [directC, contentRecord('c')],
  ]);
  const recordsB = graph([
    [firstRoot, contentRecord('first', [directB, directC, directA])],
    [secondRoot, contentRecord('second', [directA, directB])],
    [directA, contentRecord('a')],
    [directB, contentRecord('b')],
    [directC, contentRecord('c')],
  ]);
  const pageA = await buildReviewPacket({ roots: [firstRoot, secondRoot], load: graphLoader(recordsA) });
  const pageB = await buildReviewPacket({ roots: [firstRoot, secondRoot], load: graphLoader(recordsB) });

  assertPageShape(pageA);
  assertPageShape(pageB);
  assert.equal(refKey(pageA.entries[0].ref), refKey(firstRoot));
  assert.equal(refKey(pageA.entries[1].ref), refKey(secondRoot));
  assert.deepEqual(entryProjection(pageA), entryProjection(pageB));
});

test('deduplicates repeated and cyclic references without unbounded traversal', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const firstRoot = repoRef('review/cycle-a.md');
  const secondRoot = repoRef('review/cycle-b.md');
  const shared = commentRef(303);
  const records = graph([
    [firstRoot, contentRecord('a', [secondRoot, shared])],
    [secondRoot, contentRecord('b', [firstRoot, shared])],
    [shared, contentRecord('shared', [firstRoot])],
  ]);
  const calls = [];
  const page = await buildReviewPacket({
    roots: [firstRoot, secondRoot],
    load: graphLoader(records, calls),
  });

  assertPageShape(page);
  const keys = page.entries.map((entry) => refKey(entry.ref));
  assert.equal(new Set(keys).size, keys.length, 'inventory contains each reference once');
  assert.deepEqual(new Set(keys), new Set([refKey(firstRoot), refKey(secondRoot), refKey(shared)]));
  assert.ok(calls.length <= 3, 'cycles do not cause repeated loader traversal');
});

test('retains unavailable and out-of-scope distinctions through explicit bounded expansion', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const root = repoRef('review/limits-root.md');
  const direct = repoRef('review/limits-direct.md');
  const deep = repoRef('review/limits-deep.md');
  const outOfScope = repoRef('outside/not-bound.md');
  const unavailable = commentRef(404);
  const records = graph([
    [root, contentRecord('root', [direct, outOfScope, unavailable])],
    [direct, contentRecord('direct', [deep])],
    [deep, contentRecord('deep content')],
    [outOfScope, outOfScopeRecord('repository-binding-required')],
    [unavailable, unavailableRecord('github-record-missing')],
  ]);
  const calls = [];
  const load = graphLoader(records, calls);
  const initial = await buildReviewPacket({ roots: [root], load });
  const expanded = await buildReviewPacket({ roots: [root], load, expand: [deep, outOfScope, unavailable] });

  const initialOutOfScope = entryFor(initial, outOfScope);
  const initialUnavailable = entryFor(initial, unavailable);
  assert.equal(initialOutOfScope.disposition, 'out-of-scope');
  assert.equal(initialOutOfScope.reason, 'repository-binding-required');
  assertNoContent(initialOutOfScope);
  assert.equal(initialUnavailable.disposition, 'unavailable');
  assert.equal(initialUnavailable.reason, 'github-record-missing');
  assertNoContent(initialUnavailable);
  assert.equal(entryFor(initial, deep).disposition, 'outside-depth');
  assertNoContent(entryFor(initial, deep));

  const expandedDeep = entryFor(expanded, deep);
  assert.equal(expandedDeep.disposition, 'inlined');
  assert.equal(expandedDeep.content, 'deep content');
  assert.equal(entryFor(expanded, outOfScope).disposition, 'out-of-scope');
  assert.equal(entryFor(expanded, unavailable).disposition, 'unavailable');
  assertNoContent(entryFor(expanded, outOfScope));
  assertNoContent(entryFor(expanded, unavailable));
  assert.ok(calls.some((ref) => refKey(ref) === refKey(deep)), 'explicit expansion reads the listed reference');
});

test('accounts for UTF-8 bytes and never truncates over-budget Unicode content', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const root = repoRef('review/unicode.md');
  const unicode = 'é🙂漢字'.repeat(2_000);
  const records = graph([[root, contentRecord(unicode)]]);
  const page = await buildReviewPacket({
    roots: [root],
    load: graphLoader(records),
    maxInlineBytes: 4096,
  });

  assertPageShape(page);
  assertFits(page, 4096);
  const entry = entryFor(page, root);
  assert.equal(entry.disposition, 'over-budget');
  assert.equal(entry.reason, 'over-budget');
  assertNoContent(entry);
  assert.doesNotMatch(JSON.stringify(page), /漢字/);
});

test('uses UTF-8 bytes when multibyte content fits by character count but not by response bytes', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const root = repoRef('review/utf8-boundary.md');
  const maxInlineBytes = 2048;
  let page;
  let content;
  let candidate;
  for (let size = 700; size <= 1_700; size += 100) {
    content = 'é'.repeat(size);
    page = await buildReviewPacket({
      roots: [root],
      load: async () => contentRecord(content),
      maxInlineBytes,
    });
    const candidateEntry = entryFor(page, root);
    candidate = { ...candidateEntry, disposition: 'inlined', content };
    delete candidate.reason;
    const candidatePage = { ...page, entries: [candidate] };
    const characterCount = JSON.stringify(candidatePage).length + 1;
    const utf8Bytes = Buffer.byteLength(JSON.stringify(candidatePage), 'utf8') + 1;
    if (characterCount <= maxInlineBytes && utf8Bytes > maxInlineBytes) break;
    candidate = null;
  }

  assert.ok(candidate, 'fixture must straddle the UTF-16/UTF-8 budget boundary');
  assertFits(page, maxInlineBytes);
  const entry = entryFor(page, root);
  assert.equal(entry.disposition, 'over-budget');
  assert.equal(entry.reason, 'over-budget');
  assertNoContent(entry);
});

test('reports packet-limit when metadata plus the CLI newline cannot fit', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const root = repoRef('review/tiny-limit.md');
  let loads = 0;
  const load = async () => {
    loads += 1;
    return contentRecord('must not be needed');
  };

  await assert.rejects(
    buildReviewPacket({ roots: [root], load, maxInlineBytes: 1 }),
    (error) => {
      assert.equal(error?.code, 'packet-limit');
      return true;
    },
  );
  assert.equal(loads, 0, 'metadata failure occurs before loader use');
});

test('paginates the complete inventory with stable total counts and retains every supplied root', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const roots = Array.from({ length: 32 }, (_, index) => repoRef(`closeout/root-${String(index).padStart(2, '0')}.md`));
  const records = graph(roots.map((root, index) => [root, contentRecord(`root ${index}`)]));
  const maxInlineBytes = 2048;
  const pages = await collectPages(buildReviewPacket, {
    roots,
    load: graphLoader(records),
    maxInlineBytes,
  });

  assert.ok(pages.length > 1, 'the inventory spans multiple bounded pages');
  const total = pages[0].counts.total;
  const cursors = new Set();
  const entries = pages.flatMap((page) => {
    assert.equal(page.counts.total, total, 'inventory total remains stable across pages');
    assertFits(page, maxInlineBytes);
    if (page.next_cursor !== null) cursors.add(page.next_cursor);
    return page.entries;
  });
  const keys = entries.map((entry) => refKey(entry.ref));
  assert.equal(new Set(keys).size, keys.length, 'pagination does not duplicate inventory entries');
  assert.deepEqual(new Set(keys), new Set(roots.map(refKey)), 'no closeout root disappears across pages');
  assert.ok(cursors.size >= 1, 'continuation cursors are emitted before the final page');
});

test('rejects stale cursors when the supplied snapshot changes instead of mixing pages', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const roots = Array.from({ length: 24 }, (_, index) => repoRef(`review/stale-${String(index).padStart(2, '0')}.md`));
  const addedRoot = repoRef('review/stale-added.md');
  const records = graph(roots.map((root) => [root, contentRecord('stable')]));
  const load = graphLoader(records);
  const first = await buildReviewPacket({ roots, load, maxInlineBytes: 2048 });
  assert.ok(first.next_cursor, 'fixture must produce a continuation cursor');

  await assert.rejects(
    buildReviewPacket({
      roots: [...roots, addedRoot],
      load,
      maxInlineBytes: 2048,
      cursor: first.next_cursor,
    }),
    (error) => {
      assert.equal(error?.code, 'packet-stale');
      return true;
    },
  );
});

test('rejects a cursor when the same query fetches changed content or references', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const roots = Array.from({ length: 24 }, (_, index) => repoRef(`review/content-stale-${String(index).padStart(2, '0')}.md`));
  const targetRoot = roots[0];
  const firstReference = repoRef('review/content-stale-first.md');
  const changedReference = repoRef('review/content-stale-changed.md');
  const snapshot = {
    content: 'snapshot version one',
    references: [firstReference],
  };
  const load = async (ref) => {
    if (refKey(ref) === refKey(targetRoot)) return contentRecord(snapshot.content, snapshot.references);
    if (refKey(ref) === refKey(firstReference)) return contentRecord('first referenced record');
    if (refKey(ref) === refKey(changedReference)) return contentRecord('changed referenced record');
    return contentRecord('stable root');
  };
  const query = { roots, load, maxInlineBytes: 2048 };
  const first = await buildReviewPacket(query);
  assert.ok(first.next_cursor, 'fixture must produce a continuation cursor');

  snapshot.content = 'snapshot version two';
  snapshot.references = [changedReference];
  await assert.rejects(
    buildReviewPacket({ ...query, cursor: first.next_cursor }),
    (error) => {
      assert.equal(error?.code, 'packet-stale');
      return true;
    },
  );
});

test('rejects URL, command, and unsafe path references before invoking the loader', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const validRoot = repoRef('review/valid.md');
  const invalidRoots = [
    'https://evil.example/review.md',
    '$(touch /tmp/review-packet-pwned)',
    'example/consumer#0',
    { url: 'https://evil.example/review.md' },
    { command: 'git show HEAD:README.md' },
    { repository, revision: validRoot.revision, path: '../outside.md' },
  ];

  for (const invalid of invalidRoots) {
    let loads = 0;
    await assert.rejects(
      buildReviewPacket({
        roots: [invalid],
        load: async () => {
          loads += 1;
          throw new Error('invalid reference reached loader');
        },
      }),
      (error) => {
        assert.match(String(error?.code ?? error?.message), /invalid|unsafe|out.of.scope/i);
        return true;
      },
      `invalid reference should be rejected: ${JSON.stringify(invalid)}`,
    );
    assert.equal(loads, 0, `loader was not called for ${JSON.stringify(invalid)}`);
  }

  const nestedInvalid = 'https://evil.example/command?run=rm%20-rf';
  let nestedCalls = [];
  await assert.rejects(
    buildReviewPacket({
      roots: [validRoot],
      load: async (ref) => {
        nestedCalls.push(ref);
        return contentRecord('root', [nestedInvalid]);
      },
    }),
    (error) => {
      assert.match(String(error?.code ?? error?.message), /invalid|unsafe|out.of.scope/i);
      return true;
    },
  );
  assert.deepEqual(nestedCalls, [validRoot], 'nested invalid references are validated before loader use');
});

test('accepts schema-shaped RepoRefs, commentRefs, and qualified work refs as ordered roots', async (t) => {
  const buildReviewPacket = requireBuilder(t);
  if (!buildReviewPacket) return;

  const roots = [repoRef('review/root.md'), commentRef(505), workRef(9)];
  const records = graph(roots.map((root, index) => [root, contentRecord(`root ${index}`)]));
  const page = await buildReviewPacket({ roots, load: graphLoader(records) });

  assertPageShape(page);
  assert.deepEqual(page.entries.slice(0, roots.length).map((entry) => entry.ref), roots);
  assert.equal(page.entries.every((entry) => entry.depth === 0), true);
  assert.equal(page.entries.every((entry) => entry.disposition === 'inlined'), true);
  assert.equal(page.limits.max_inline_bytes ?? page.limits.maxInlineBytes, 65536);
});
