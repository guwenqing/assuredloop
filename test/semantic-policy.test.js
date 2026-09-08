import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolvePolicy } from '../src/policy.js';
import {
  acceptanceBody,
  buildCaseA,
  buildCaseB,
  buildCaseC,
  otherPolicyRevision,
  policyPath,
  repository,
} from './fixtures/semantic-policy/helpers.mjs';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);

function sourceFor(result, kind, commentId) {
  const source = result.sources.find((entry) => entry.role === kind);
  assert.ok(source, `missing ${kind} source`);
  assert.equal(source.source.kind, 'github-issue-comment');
  assert.equal(source.source.repository, repository);
  assert.equal(source.source.comment_id, commentId);
  return source;
}

function assertFormalResult(result) {
  assert.equal(result.status, 'available');
  assert.equal(result.mode, 'bootstrap');
  assert.equal(result.activation, null);
  assert.ok(result.policy_ref && typeof result.policy_ref === 'object');
  assert.match(JSON.stringify(result.findings), /semantic-authorization-review-required/);
}

test('semantic policy fixtures preserve fixed policy and proposal source bodies without inferring authorization', async (t) => {
  const fixture = await buildCaseA();
  t.after(() => fixture.dispose());
  const result = await resolvePolicy({ adapter: fixture.adapter, work: `${repository}#77`, packageRoot: repositoryRoot });

  assertFormalResult(result);
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.equal(result.policy_ref.path, policyPath);
  assert.equal(sourceFor(result, 'project.bootstrap.policy_acceptance', 101).content, acceptanceBody('fixed').policy);
  assert.equal(sourceFor(result, 'project.bootstrap.proposal_acceptance', 102).content, acceptanceBody('fixed').proposal);
  assert.equal(fixture.adapter.calls.readComment.map((ref) => ref.comment_id).sort((a, b) => a - b).join(','), '101,102');
});

test('scope-only acceptance remains a formal source plus semantic authorization review input', async (t) => {
  const fixture = await buildCaseB();
  t.after(() => fixture.dispose());
  const result = await resolvePolicy({ adapter: fixture.adapter, work: `${repository}#77`, packageRoot: repositoryRoot });

  assertFormalResult(result);
  assert.equal(sourceFor(result, 'project.bootstrap.policy_acceptance', 101).content, acceptanceBody('scoped').policy);
  assert.equal(sourceFor(result, 'project.bootstrap.proposal_acceptance', 102).content, acceptanceBody('scoped').proposal);
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.match(JSON.stringify(result.findings), /semantic-authorization-review-required/);
});

test('an acceptance naming a different policy revision does not redirect the fixed policy source', async (t) => {
  const fixture = await buildCaseC();
  t.after(() => fixture.dispose());
  const result = await resolvePolicy({ adapter: fixture.adapter, work: `${repository}#77`, packageRoot: repositoryRoot });

  assertFormalResult(result);
  assert.equal(result.policy_ref.revision, fixture.policyRevision);
  assert.notEqual(result.policy_ref.revision, otherPolicyRevision);
  const policySource = result.sources.find((entry) => entry.role === 'project.bootstrap.policy_ref');
  assert.ok(policySource);
  assert.equal(policySource.source.kind, 'git-blob');
  assert.equal(policySource.source.ref.revision, fixture.policyRevision);
  assert.equal(sourceFor(result, 'project.bootstrap.policy_acceptance', 101).content, acceptanceBody('different').policy);
  assert.match(JSON.stringify(result.sources), new RegExp(otherPolicyRevision));
});

test('semantic policy inputs do not expose answer or verdict metadata', () => {
  const source = readFileSync(new URL('./fixtures/semantic-policy/common.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['expected', 'verdict', 'answer_key', 'semantic_result', 'authorized: true']) {
    assert.equal(source.includes(forbidden), false, `fixture source must not contain ${forbidden}`);
  }
});
