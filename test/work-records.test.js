import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  advancedDestinationBase,
  cancellationIssueBody,
  destinationBase,
  evidenceEntry,
  evidenceRecord,
  firstEvidenceRecord,
  firstHead,
  firstMerge,
  firstPrBody,
  firstPrRecord,
  firstPullWork,
  issueBody,
  issueRecord,
  categoryMapping,
  issueSnapshot,
  issueWork,
  noSpecIssueRecord,
  planRef,
  primaryBasis,
  pullSnapshot,
  prerequisiteBundle,
  prerequisiteWork,
  repository,
  researchRecord,
  secondEvidenceRecord,
  secondHead,
  secondMerge,
  secondPrBody,
  secondPrRecord,
  taskFile,
  workRef,
} from './fixtures/work-records/helpers.mjs';

const runtimeUrl = new URL('../src/work-records.js', import.meta.url);
let runtime;
let importError;
try {
  runtime = await import(runtimeUrl.href);
} catch (error) {
  importError = error;
}

function requireRuntime(t) {
  if (importError) {
    t.skip(`Issue #8 work-records runtime is unavailable: ${importError.message}`);
    return null;
  }
  assert.equal(typeof runtime.parseWorkRecord, 'function');
  assert.equal(typeof runtime.checkWorkRecords, 'function');
  return runtime;
}

function findingText(value) {
  return JSON.stringify(value ?? []).toLowerCase();
}

function assertFinding(value, pattern, message = `expected finding matching ${pattern}`) {
  assert.ok(Array.isArray(value), 'findings must be an array');
  assert.match(findingText(value), pattern, message);
}

function assertResultShape(result) {
  assert.ok(result && typeof result === 'object');
  assert.equal(typeof result.status, 'string');
  assert.ok(Array.isArray(result.findings), 'work-record results expose findings');
}

function assertValid(result) {
  assertResultShape(result);
  assert.equal(result.status, 'valid');
}

function assertInvalid(result) {
  assertResultShape(result);
  assert.equal(result.status, 'invalid');
}

function clone(value) {
  return structuredClone(value);
}

function bodyFor(record, options = {}) {
  const title = options.title ?? 'Sanitized work record';
  const assignment = options.assignment ?? 'Assigned outcome: preserve the bounded work context.';
  const plan = options.plan ?? 'Plan prose: map this work to the native task and review the actual result.';
  const heading = options.heading ?? '## Workflow context';
  const json = JSON.stringify(record, null, 2);
  if (options.fence === null) return `${title}\n\n${assignment}\n\n${heading}\n${json}\n`;
  return `${title}\n\n${assignment}\n\n${plan}\n\n${heading}\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

function makeSourceResolver({ missing = [], contents = {} } = {}) {
  const calls = [];
  const missingPaths = new Set(missing);
  const sourceContents = {
    'openspec/changes/records/tasks.md': taskFile,
    'openspec/changes/records/specs/traceability.md': '# Record link status checks\n',
    'openspec/changes/records/design.md': '# Focused context\n',
    ...contents,
  };
  return {
    calls,
    async resolveRef(ref) {
      calls.push(clone(ref));
      if (missingPaths.has(ref.path)) {
        const error = new Error(`fixture source is unavailable: ${ref.path}`);
        error.code = 'record-unavailable';
        error.details = { reason: 'path-missing' };
        throw error;
      }
      if (!Object.hasOwn(sourceContents, ref.path)) {
        const error = new Error(`fixture source is out of scope: ${ref.path}`);
        error.code = 'reference-out-of-scope';
        throw error;
      }
      return { content: sourceContents[ref.path] };
    },
  };
}

function makeWorkResolver({ bundles = new Map([[prerequisiteWork, prerequisiteBundle()]]), unavailable = [] } = {}) {
  const calls = [];
  const unavailableRefs = new Set(unavailable);
  return {
    calls,
    async resolveWork(ref) {
      calls.push(ref);
      if (unavailableRefs.has(ref)) {
        const error = new Error(`fixture work is unavailable: ${ref}`);
        error.code = 'record-unavailable';
        error.details = { reason: 'work-missing' };
        throw error;
      }
      const bundle = bundles.get(ref);
      if (!bundle) {
        const error = new Error(`fixture work is unavailable: ${ref}`);
        error.code = 'record-unavailable';
        error.details = { reason: 'work-missing' };
        throw error;
      }
      return clone(bundle);
    },
  };
}

function handoffInputs(overrides = {}) {
  const firstPull = pullSnapshot({ number: 42, body: firstPrBody });
  const secondPull = pullSnapshot({
    number: 43,
    body: secondPrBody,
    headSha: secondHead,
  });
  const resolver = makeSourceResolver();
  const workResolver = makeWorkResolver();
  return {
    work: issueWork,
    categoryMapping,
    issue: issueSnapshot(),
    pulls: [firstPull, secondPull],
    evidence: [
      // The outer ref identifies the source comment containing this record;
      // record.evidence contains its separate supporting references.
      evidenceEntry(firstEvidenceRecord, { repository, comment_id: 410 }),
      evidenceEntry(secondEvidenceRecord, { repository, comment_id: 420 }),
    ],
    phase: 'handoff',
    resolveRef: resolver.resolveRef,
    resolveWork: workResolver.resolveWork,
    ...overrides,
    _resolver: resolver,
    _workResolver: workResolver,
  };
}

function mergedCloseoutInputs(overrides = {}) {
  const currentEvidence = evidenceRecord({
    pr: firstPullWork,
    scope: 'Current merged delivery formal result',
  });
  const secondCurrentEvidence = evidenceRecord({
    pr: workRef(43),
    head: secondHead,
    scope: 'Current second mapped delivery formal result',
    evidence: [{ repository, comment_id: 402 }],
  });
  return handoffInputs({
    issue: issueSnapshot({ state: 'closed', state_reason: 'completed' }),
    pulls: [
      pullSnapshot({
        number: 42,
        body: firstPrBody,
        state: 'closed',
        merged: true,
        merged_at: '2026-09-08T03:30:00Z',
        merge_commit_sha: firstMerge,
      }),
      pullSnapshot({
        number: 43,
        body: secondPrBody,
        state: 'closed',
        merged: true,
        merged_at: '2026-09-08T03:35:00Z',
        merge_commit_sha: secondMerge,
        headSha: secondHead,
      }),
    ],
    evidence: [
      evidenceEntry(currentEvidence, { repository, comment_id: 410 }),
      evidenceEntry(secondCurrentEvidence, { repository, comment_id: 420 }),
    ],
    phase: 'closeout',
    ...overrides,
  });
}

function multiIssuePull(number, items) {
  const record = {
    ...firstPrRecord,
    issues: [prerequisiteWork, issueWork],
    plan_items: [planRef(items)],
  };
  return pullSnapshot({
    number,
    body: bodyFor(record),
    state: 'closed',
    merged: true,
    merged_at: '2026-09-08T03:40:00Z',
    merge_commit_sha: firstMerge,
    headSha: firstHead,
  });
}

function multiIssueEvidence(number, scope) {
  return evidenceEntry(
    evidenceRecord({
      pr: workRef(number),
      head: firstHead,
      scope,
      evidence: [{ repository, comment_id: 406 }],
    }),
    { repository, comment_id: 460 },
  );
}

test('work-records module exposes the planned parser and lifecycle-check API', () => {
  if (importError) {
    throw new Error(
      `Issue #8 work-records runtime is unavailable; expected src/work-records.js before behavioral tests: ${importError.message}`,
      { cause: importError },
    );
  }
  assert.ok(runtime && typeof runtime === 'object');
  assert.equal(typeof runtime.parseWorkRecord, 'function');
  assert.equal(typeof runtime.checkWorkRecords, 'function');
});

test('parseWorkRecord reads exactly one fenced JSON block under the authoritative heading', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const result = await module.parseWorkRecord({ body: issueBody, kind: 'issue' });
  assert.ok(result.record && typeof result.record === 'object');
  assert.deepEqual(result.record, issueRecord);
  assert.ok(Array.isArray(result.findings));
});

test('parseWorkRecord ignores a heading-looking string inside an unrelated fenced block', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const fakeHeading = [
    '```markdown',
    '## Workflow context',
    JSON.stringify(issueRecord),
    '```',
    '',
    'The heading above is quoted evidence, not the record block.',
  ].join('\n');
  const result = await module.parseWorkRecord({ body: fakeHeading, kind: 'issue' });
  assert.equal(result.record, null);
  assertFinding(result.findings, /missing|workflow.?context|authority/);
});

test('parseWorkRecord rejects missing, duplicate, and malformed authoritative blocks', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const missing = await module.parseWorkRecord({ body: 'A rough request with no routed record.', kind: 'issue' });
  assert.equal(missing.record, null);
  assertFinding(missing.findings, /missing|workflow.?context/);

  const block = bodyFor(issueRecord);
  const duplicate = await module.parseWorkRecord({ body: `${block}\n${block}`, kind: 'issue' });
  assert.equal(duplicate.record, null);
  assertFinding(duplicate.findings, /duplicate|multiple|exactly one/);

  const malformed = [
    '## Workflow context',
    '',
    '```json',
    '{"activity": "deliver",',
    '```',
  ].join('\n');
  const malformedResult = await module.parseWorkRecord({ body: malformed, kind: 'issue' });
  assert.equal(malformedResult.record, null);
  assertFinding(malformedResult.findings, /json|parse|malformed/);
});

test('standalone evidence and self-change decision files may be plain JSON', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const evidence = await module.parseWorkRecord({
    body: JSON.stringify(firstEvidenceRecord),
    kind: 'evidence',
  });
  assert.deepEqual(evidence.record, firstEvidenceRecord);

  const decision = {
    record_type: 'self-change-decision',
    selection: 'closeout-alternative',
    work: workRef(70),
    rationale: 'The owner selected the reviewed closeout as the bounded self-change demonstration.',
    authorized_by: 'example-owner',
    evidence: [{ repository, comment_id: 404 }],
  };
  const decisionResult = await module.parseWorkRecord({
    body: JSON.stringify(decision),
    kind: 'selfChangeDecision',
  });
  assert.deepEqual(decisionResult.record, decision);
});

test('allowMissing is limited to an explicit rough-request caller context', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const ordinary = await module.parseWorkRecord({
    body: 'No routed context yet.',
    kind: 'issue',
    allowMissing: true,
  });
  assert.equal(ordinary.record, null);
  assertFinding(ordinary.findings, /missing|not allowed|context/);

  const roughRequest = await module.parseWorkRecord({
    body: 'No routed context yet.',
    kind: 'roughRequest',
    allowMissing: true,
  });
  assert.equal(roughRequest.record, null);
  assert.ok(Array.isArray(roughRequest.findings));
  assert.doesNotMatch(findingText(roughRequest.findings), /required|malformed|duplicate/);
});

test('parser reuses schema shape rules for missing basis and justified no-Spec records', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const missingBasisRecord = clone(noSpecIssueRecord);
  delete missingBasisRecord.no_spec_reason;
  const missingBasis = await module.parseWorkRecord({
    body: bodyFor(missingBasisRecord),
    kind: 'issue',
  });
  assert.ok(missingBasis.record && typeof missingBasis.record === 'object');
  assertFinding(missingBasis.findings, /basis|no.?spec|schema|invalid/);

  const validNoSpec = await module.parseWorkRecord({
    body: bodyFor(noSpecIssueRecord, {
      assignment: 'Assigned outcome: make this bounded no-Spec maintenance change.',
    }),
    kind: 'issue',
  });
  assert.deepEqual(validNoSpec.record, noSpecIssueRecord);
  assert.doesNotMatch(findingText(validNoSpec.findings), /missing|required|invalid/);
});

test('checkWorkRecords resolves native PlanRef task items and carries source context forward', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const input = handoffInputs();
  const result = await module.checkWorkRecords(input);
  assertValid(result);
  assert.ok(result.context && typeof result.context === 'object');
  const contextText = JSON.stringify(result.context);
  assert.match(contextText, /Assigned outcome: preserve assignment prose/);
  assert.match(contextText, /Plan prose: check task 3\.2 and task 3\.3/);
  assert.match(contextText, /Scoped record and lifecycle checks/);
  assert.match(contextText, /main/);
  assert.equal(input._resolver.calls.some((ref) => ref.path === 'openspec/changes/records/tasks.md'), true);
  assert.notDeepEqual(input.evidence[0].ref, input.evidence[0].record.evidence[0]);
  assert.notDeepEqual(input.evidence[1].ref, input.evidence[1].record.evidence[0]);
});

test('multiple mapped PR contributions are accepted without identical basis arrays or one-PR coverage', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const input = handoffInputs();
  const result = await module.checkWorkRecords(input);
  assertValid(result);
  assert.equal(input.pulls.length, 2);
  assert.notDeepEqual(firstPrRecord.basis, secondPrRecord.basis);
  assert.notDeepEqual(firstPrRecord.plan_items, secondPrRecord.plan_items);
  assert.doesNotMatch(findingText(result.findings), /one.?pr|single.?pr|cover(?:s|age).*all/);
});

test('a merged PR mapped to two Issues credits only the canonical tasks owned by the selected Issue', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const base = mergedCloseoutInputs();
  const resolver = makeWorkResolver();
  const result = await module.checkWorkRecords({
    ...base,
    pulls: [multiIssuePull(46, ['3.1', '3.2']), base.pulls[1]],
    evidence: [multiIssueEvidence(46, 'Shared prerequisite and current Issue contribution'), base.evidence[1]],
    resolveWork: resolver.resolveWork,
  });
  assertValid(result);
  assert.doesNotMatch(findingText(result.findings), /plan.?mapping.?invalid|delivery.?plan.?uncovered/);

  const sharedAssociation = result.context.task_associations.find(({ ref }) =>
    ref.items?.includes('3.1') && ref.items?.includes('3.2'));
  assert.ok(sharedAssociation, 'shared PR PlanRef association must be retained');
  assert.deepEqual(
    Object.fromEntries(sharedAssociation.associations.map(({ item, owners }) => [item, owners])),
    { '3.1': [prerequisiteWork], '3.2': [issueWork] },
  );
});

test('a merged PR delivering only another Issue\'s canonical task leaves the selected Issue uncovered', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const base = mergedCloseoutInputs();
  const resolver = makeWorkResolver();
  const result = await module.checkWorkRecords({
    ...base,
    pulls: [multiIssuePull(47, ['3.1'])],
    evidence: [multiIssueEvidence(47, 'Shared prerequisite-only contribution')],
    resolveWork: resolver.resolveWork,
  });
  assertInvalid(result);
  assertFinding(result.findings, /delivery.?plan.?uncovered/);
  assert.match(findingText(result.findings), /3\.2|3\.3/);
  assert.doesNotMatch(findingText(result.findings), /plan.?mapping.?invalid/);

  const sharedAssociation = result.context.task_associations.find(({ ref }) => ref.items?.includes('3.1'));
  assert.ok(sharedAssociation, 'other Issue PlanRef association must be retained');
  assert.deepEqual(sharedAssociation.associations[0].owners, [prerequisiteWork]);
});

test('parent membership does not become a synthetic depends_on prerequisite', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const input = handoffInputs({
    issue: {
      ...issueSnapshot(),
      parent: { number: 20, html_url: `https://github.com/${repository}/issues/20` },
    },
  });
  const result = await module.checkWorkRecords(input);
  assertValid(result);
  assert.doesNotMatch(findingText(result.findings), /parent.*depend|depend.*parent/);
});

test('handoff rejects contradictory Issue/PR identity and reciprocity mappings', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const unrelatedRecord = {
    ...clone(firstPrRecord),
    issues: [workRef(999)],
  };
  const unrelatedPull = pullSnapshot({ number: 42, body: bodyFor(unrelatedRecord) });
  const unrelated = handoffInputs({ pulls: [unrelatedPull], evidence: [evidenceEntry(firstEvidenceRecord)] });
  const unrelatedResult = await module.checkWorkRecords(unrelated);
  assertInvalid(unrelatedResult);
  assertFinding(unrelatedResult.findings, /unrelated|issue|mapping|recipro/);

  const mismatchedEvidence = clone(firstEvidenceRecord);
  mismatchedEvidence.pr = workRef(999);
  const mismatch = handoffInputs({ evidence: [evidenceEntry(mismatchedEvidence)] });
  const mismatchResult = await module.checkWorkRecords(mismatch);
  assertInvalid(mismatchResult);
  assertFinding(mismatchResult.findings, /evidence|pr|mapping|identity/);

  const identityPull = pullSnapshot({ number: 99, body: firstPrBody });
  const identity = handoffInputs({
    pulls: [identityPull],
    evidence: [evidenceEntry(firstEvidenceRecord)],
  });
  const identityResult = await module.checkWorkRecords(identity);
  assertInvalid(identityResult);
  assertFinding(identityResult.findings, /identity|number|pr|evidence/);

});

test('handoff checks each PlanRef item against the fetched native task text', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const missingItem = clone(issueRecord);
  missingItem.plan_items = [planRef(['3.9'])];
  const input = handoffInputs({ issue: issueSnapshot({ body: bodyFor(missingItem) }) });
  const result = await module.checkWorkRecords(input);
  assertInvalid(result);
  assertFinding(result.findings, /task|plan|3\.9|mapping/);
});

test('depends_on is checked through an actual prerequisite Issue/PR/evidence bundle', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const workResolver = makeWorkResolver();
  const result = await module.checkWorkRecords({
    ...mergedCloseoutInputs({ resolveWork: workResolver.resolveWork }),
  });
  assertValid(result);
  assert.deepEqual(workResolver.calls, [prerequisiteWork]);
  const contextText = JSON.stringify(result.context);
  assert.match(contextText, /Closed prerequisite delivery/);
  assert.match(contextText, /Prerequisite delivery formal result/);
  assert.doesNotMatch(contextText, /delivered:\s*true/);
});

test('an open actual prerequisite blocks closeout while the dependent delivery is otherwise complete', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const workResolver = makeWorkResolver({
    bundles: new Map([[prerequisiteWork, prerequisiteBundle({
      state: 'open',
      state_reason: null,
      merged: false,
      evidence: false,
    })]]),
  });
  const result = await module.checkWorkRecords({
    ...mergedCloseoutInputs({ resolveWork: workResolver.resolveWork }),
  });
  assertInvalid(result);
  assertFinding(result.findings, /prerequisite|open|merged|delivery/);
});

test('a cancelled actual prerequisite contributes no delivered scope', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const workResolver = makeWorkResolver({
    bundles: new Map([[prerequisiteWork, prerequisiteBundle({
      state: 'closed',
      state_reason: 'not_planned',
      merged: false,
      evidence: false,
    })]]),
  });
  const result = await module.checkWorkRecords({
    ...mergedCloseoutInputs({ resolveWork: workResolver.resolveWork }),
  });
  assertInvalid(result);
  assertFinding(result.findings, /cancel|not.?planned|prerequisite|non.?deliver/);
});

test('an unavailable actual prerequisite remains unavailable rather than becoming a pass', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const workResolver = makeWorkResolver({ unavailable: [prerequisiteWork] });
  const result = await module.checkWorkRecords({
    ...handoffInputs({ resolveWork: workResolver.resolveWork }),
  });
  assertResultShape(result);
  assert.equal(result.status, 'unavailable');
  assertFinding(result.findings, /prerequisite|unavailable|work/);
});

test('planning may retain a future PlanRef while handoff reports its unavailable source', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const futureRecord = clone(issueRecord);
  futureRecord.activity = 'plan';
  futureRecord.plan_items = [planRef(['3.2'], { path: 'openspec/changes/future/tasks.md' })];
  const planningResolver = makeSourceResolver({ missing: ['openspec/changes/future/tasks.md'] });
  const planning = await module.checkWorkRecords({
    ...handoffInputs({
      issue: issueSnapshot({ body: bodyFor(futureRecord), labels: [{ name: 'type:architecture-task' }] }),
      pulls: [],
      evidence: [],
    }),
    phase: 'planning',
    resolveRef: planningResolver.resolveRef,
  });
  assertResultShape(planning);
  assert.notEqual(planning.status, 'invalid');
  assertFinding(planning.findings, /planning|future|defer|unresolved|unavailable/);

  const handoffResolver = makeSourceResolver({ missing: ['openspec/changes/future/tasks.md'] });
  const handoff = await module.checkWorkRecords({
    ...handoffInputs({
      issue: issueSnapshot({ body: bodyFor(futureRecord), labels: [{ name: 'type:architecture-task' }] }),
      pulls: [],
      evidence: [],
    }),
    phase: 'handoff',
    resolveRef: handoffResolver.resolveRef,
  });
  assertResultShape(handoff);
  assert.notEqual(handoff.status, 'valid');
  assertFinding(handoff.findings, /unavailable|plan|task|handoff/);

  const deliverFuture = clone(futureRecord);
  deliverFuture.activity = 'deliver';
  const deliverPlanningResolver = makeSourceResolver({ missing: ['openspec/changes/future/tasks.md'] });
  const deliverPlanning = await module.checkWorkRecords({
    ...handoffInputs({ issue: issueSnapshot({ body: bodyFor(deliverFuture) }) }),
    phase: 'planning',
    resolveRef: deliverPlanningResolver.resolveRef,
  });
  assertResultShape(deliverPlanning);
  assert.notEqual(deliverPlanning.status, 'valid');
  assertFinding(deliverPlanning.findings, /unavailable|plan|task|deliver/);
});

test('a closed delivery Issue without a merged actual PR and evidence is unsupported', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const closedIssue = issueSnapshot({ state: 'closed', state_reason: 'completed' });
  const unmergedPull = pullSnapshot({ state: 'closed', merged: false, merged_at: null, merge_commit_sha: null });
  const result = await module.checkWorkRecords({
    ...handoffInputs({ issue: closedIssue, pulls: [unmergedPull], evidence: [] }),
    phase: 'closeout',
  });
  assertInvalid(result);
  assertFinding(result.findings, /closed|merged|delivery|evidence|unsupported/);
});

test('missing required evidence is an error even when a PR identity is present', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const result = await module.checkWorkRecords({
    ...handoffInputs({ evidence: [] }),
    phase: 'closeout',
  });
  assertInvalid(result);
  assertFinding(result.findings, /evidence|required|missing/);
});

test('feature-looking branches and nondefault destinations do not imply stage-only delivery', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const releasePull = pullSnapshot({
    number: 42,
    body: firstPrBody,
    state: 'open',
    baseRef: 'release-candidate',
    headRef: 'feature/records-stage',
  });
  const releaseEvidence = evidenceRecord({
    baseRef: 'release-candidate',
    scope: 'Actual release-candidate destination assessment',
  });
  const result = await module.checkWorkRecords({
    ...handoffInputs({ pulls: [releasePull], evidence: [evidenceEntry(releaseEvidence)] }),
  });
  assertValid(result);
  assert.doesNotMatch(findingText(result.findings), /default.?branch|stage.?only|feature.?branch.*invalid/);
});

test('merged feature delivery preserves formal PR facts without claiming wider completion', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const firstMerged = pullSnapshot({
    number: 42,
    body: firstPrBody,
    state: 'closed',
    merged: true,
    merged_at: '2026-09-08T04:00:00Z',
    merge_commit_sha: firstMerge,
    baseRef: 'release-candidate',
    baseSha: advancedDestinationBase,
    headRef: 'feature/records-stage',
  });
  const secondMerged = pullSnapshot({
    number: 43,
    body: secondPrBody,
    state: 'closed',
    merged: true,
    merged_at: '2026-09-08T04:05:00Z',
    merge_commit_sha: secondMerge,
    baseRef: 'release-candidate',
    baseSha: advancedDestinationBase,
    headSha: secondHead,
    headRef: 'feature/records-stage',
  });
  const firstEvidence = evidenceRecord({
    pr: firstPullWork,
    baseRef: 'release-candidate',
    baseSha: destinationBase,
    scope: 'First contribution formal result',
  });
  const secondEvidence = evidenceRecord({
    pr: workRef(43),
    head: secondHead,
    baseRef: 'release-candidate',
    baseSha: destinationBase,
    scope: 'Second contribution formal result',
    evidence: [{ repository, comment_id: 402 }],
  });
  const result = await module.checkWorkRecords({
    ...handoffInputs({
      issue: issueSnapshot({ state: 'closed', state_reason: 'completed' }),
      pulls: [firstMerged, secondMerged],
      evidence: [evidenceEntry(firstEvidence), evidenceEntry(secondEvidence)],
    }),
    phase: 'closeout',
  });
  assertValid(result);
  const contextText = JSON.stringify(result.context);
  assert.match(contextText, new RegExp(firstMerge));
  assert.match(contextText, new RegExp(firstHead));
  assert.match(contextText, /release-candidate/);
  assert.match(contextText, /First contribution formal result/);
  assert.match(contextText, /Second contribution formal result/);
  assert.match(findingText(result.findings), /semantic|scope|wider|overall|review/);
  assert.doesNotMatch(findingText(result.findings), /merge permission granted|overall completion proven/);
});

test('squash delivery is traced through final PR and merge commit without intermediate ancestry', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const finalPull = pullSnapshot({
    number: 44,
    body: bodyFor({
      ...firstPrRecord,
      issues: [issueWork],
      plan_items: [planRef(['3.2', '3.3'])],
    }),
    state: 'closed',
    merged: true,
    merged_at: '2026-09-08T04:10:00Z',
    merge_commit_sha: firstMerge,
    baseRef: 'main',
    baseSha: advancedDestinationBase,
    headSha: firstHead,
    headRef: 'feature/squashed-records',
  });
  const finalEvidence = evidenceRecord({
    pr: workRef(44),
    baseSha: destinationBase,
    scope: 'Final PR and resulting squash commit',
  });
  const result = await module.checkWorkRecords({
    ...handoffInputs({
      issue: issueSnapshot({ state: 'closed', state_reason: 'completed' }),
      pulls: [finalPull],
      evidence: [evidenceEntry(finalEvidence)],
    }),
    phase: 'closeout',
  });
  assertValid(result);
  assert.match(JSON.stringify(result.context), new RegExp(firstMerge));
  assert.doesNotMatch(findingText(result.findings), /intermediate.*ancestry|required.*ancestor/);
});

test('research completion uses findings, limits, and review without inventing an implementation PR', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const researchIssueRecord = {
    activity: 'research',
    request: workRef(35),
    basis: [primaryBasis],
  };
  const researchBody = bodyFor(researchIssueRecord, {
    assignment: 'Assigned outcome: return bounded research findings and explicit limits to the owner.',
    plan: 'Plan prose: answer the scoped question and recommend no automatic successor.',
  });
  const result = await module.checkWorkRecords({
    work: workRef(35),
    categoryMapping,
    issue: issueSnapshot({ number: 35, body: researchBody, labels: [{ name: 'type:spike' }], state: 'closed', state_reason: 'completed' }),
    pulls: [],
    evidence: [evidenceEntry(researchRecord, { repository, comment_id: 405 })],
    phase: 'closeout',
    resolveRef: makeSourceResolver().resolveRef,
  });
  assertValid(result);
  const contextText = JSON.stringify(result.context);
  assert.match(contextText, /findings|limits|bounded research/);
  assert.doesNotMatch(contextText, /fake implementation|implementation PR/);
  assert.match(findingText(result.findings), /research|findings|non.?delivery|semantic/);
});

test('cancellation is non-delivery and retains the prose explanation for semantic review', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const cancelledRecord = clone(noSpecIssueRecord);
  const result = await module.checkWorkRecords({
    work: issueWork,
    categoryMapping,
    issue: issueSnapshot({
      body: cancellationIssueBody,
      state: 'closed',
      state_reason: 'not_planned',
    }),
    pulls: [],
    evidence: [],
    phase: 'closeout',
    resolveRef: makeSourceResolver().resolveRef,
  });
  assertResultShape(result);
  assert.notEqual(result.status, 'delivered');
  assert.match(JSON.stringify(result.context), /considered and then cancelled|retain the explanation/);
  assert.match(findingText(result.findings), /cancel|not.?planned|non.?deliver|semantic/);

  const missingExplanation = await module.checkWorkRecords({
    work: issueWork,
    categoryMapping,
    issue: issueSnapshot({
      body: bodyFor(cancelledRecord, { assignment: '', plan: '' }),
      state: 'closed',
      state_reason: 'not_planned',
    }),
    pulls: [],
    evidence: [],
    phase: 'closeout',
    resolveRef: makeSourceResolver().resolveRef,
  });
  assertResultShape(missingExplanation);
  assert.match(findingText(missingExplanation.findings), /explanation|rationale|cancel|not.?planned/);
});

test('an open closeout Issue and its own open PR are allowed during pre-merge handoff', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const closeoutRecord = {
    activity: 'closeout',
    request: workRef(35),
    basis: [primaryBasis],
    plan_items: [planRef(['3.4'])],
    depends_on: [issueWork],
  };
  const closeoutBody = bodyFor(closeoutRecord, {
    assignment: 'Assigned outcome: prepare the owner-led closeout candidate for independent review.',
    plan: 'Plan prose: final merge and Issue closure remain future operational actions.',
  });
  const ownPull = pullSnapshot({
    number: 70,
    body: bodyFor({
      ...firstPrRecord,
      issues: [workRef(70)],
      plan_items: [planRef(['3.4'])],
    }),
    headRef: 'feature/closeout',
    headSha: firstHead,
  });
  const completedDependency = mergedCloseoutInputs();
  const workResolver = makeWorkResolver({
    bundles: new Map([
      [issueWork, {
        issue: completedDependency.issue,
        pulls: completedDependency.pulls,
        evidence: completedDependency.evidence,
      }],
      [prerequisiteWork, prerequisiteBundle()],
    ]),
  });
  const result = await module.checkWorkRecords({
    work: workRef(70),
    categoryMapping,
    issue: issueSnapshot({ number: 70, body: closeoutBody, labels: [{ name: 'type:architecture-task' }], state: 'open' }),
    pulls: [ownPull],
    evidence: [],
    phase: 'handoff',
    resolveRef: makeSourceResolver().resolveRef,
    resolveWork: workResolver.resolveWork,
  });
  assertValid(result);
  assert.doesNotMatch(findingText(result.findings), /own.*merge|required.*closure|self.?blocked/);
});

test('unavailable prerequisite sources remain unavailable rather than becoming a pass', async (t) => {
  const module = requireRuntime(t);
  if (!module) return;

  const resolver = makeSourceResolver({ missing: ['openspec/changes/records/tasks.md'] });
  const result = await module.checkWorkRecords({
    ...handoffInputs({ resolveRef: resolver.resolveRef }),
  });
  assertResultShape(result);
  assert.equal(result.status, 'unavailable');
  assertFinding(result.findings, /unavailable|prerequisite|plan|task/);
});

test('sanitized stage-assignment and wider-final-outcome cases remain semantic-review inputs without answer keys', async () => {
  const cases = [
    'semantic-stage-assigned.json',
    'semantic-stage-as-final.json',
  ];
  for (const name of cases) {
    const value = JSON.parse(await readFile(new URL(`./fixtures/work-records/${name}`, import.meta.url), 'utf8'));
    assert.equal(typeof value.case, 'string');
    assert.ok(value.issue && typeof value.issue === 'object');
    assert.ok(Array.isArray(value.pulls));
    assert.ok(Array.isArray(value.evidence));
    for (const forbidden of ['answer', 'expected', 'verdict', 'semantic_result']) {
      assert.equal(Object.hasOwn(value, forbidden), false, `${name} must not encode a semantic answer`);
    }
  }
});
