import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCloseout } from '../src/closeout.js';
import { captureManifest } from '../src/manifest.js';
import { snapshot } from './fixtures/synchronization/fixtures.mjs';
import { contextBody, evidenceRecord } from './fixtures/work-records/helpers.mjs';

async function assess({ dependencyKind, wrongArray = false }) {
  const input = snapshot();
  const { repository, change, baseRevision, headRevision, deltaRevision } = input;
  const dependency = `${repository}#${dependencyKind === 'pr' ? 81 : 80}`;
  const policyRef = { repository, revision: baseRevision, path: 'policy.md' };
  const assessment = evidenceRecord({ pr: `${repository}#81`, head: headRevision });
  const body = JSON.stringify(assessment);
  const source = { kind: 'github-issue-comment', repository, comment_id: 801, endpoint: 'GET /repos/{owner}/{repo}/issues/comments/{id}', api_version: '2022-11-28', media_type: 'application/vnd.github.raw+json', field: 'body', encoding: 'utf-8', normalization: 'none' };
  const manifestPath = `openspec/changes/${change}/acceptance-manifest.json`;
  const inventories = new Map([[baseRevision, input.baseFiles], [headRevision, input.candidateFiles], [deltaRevision, input.deltaFiles]]);
  const reads = [];
  let manifest;
  const adapter = {
    listFiles: async (ref) => (inventories.get(ref.revision) || []).filter((file) => ref.path === '.' || file.path.startsWith(`${ref.path}/`)).map(({ path }) => ({ path, mode: '100644' })),
    readBlob: async (ref) => ref.path === manifestPath ? Buffer.from(JSON.stringify(manifest)) : inventories.get(ref.revision).find((file) => file.path === ref.path).content,
    readComment: async () => ({ id: 801, body }),
    readBranchHead: async () => baseRevision,
    readIssue: async (work) => { reads.push(work); return { number: Number(work.split('#')[1]), repository_url: `https://api.github.com/repos/${repository}`, state: 'closed', ...(dependencyKind === 'pr' ? { pull_request: { url: `https://api.github.com/repos/${repository}/pulls/81` } } : { state_reason: 'completed' }) }; },
  };
  const captured = await captureManifest({ adapter, closeoutPolicyRef: policyRef, capturedAt: '2026-09-12T10:00:00Z', deliveries: [{ issues: [`${repository}#80`], prs: [`${repository}#81`], source }] });
  assert.deepEqual(captured.findings, []);
  manifest = captured.manifest;
  if (wrongArray && dependencyKind === 'pr') { manifest.deliveries[0].issues.push(dependency); manifest.deliveries[0].prs = [`${repository}#82`]; }
  if (wrongArray && dependencyKind === 'issue') { manifest.deliveries[0].issues = [`${repository}#79`]; manifest.deliveries[0].prs.push(dependency); }
  const record = { activity: 'closeout', request: `${repository}#1`, change, basis: [policyRef], depends_on: [dependency], plan_items: [{ repository, revision: deltaRevision, path: `openspec/changes/${change}/tasks.md`, items: ['3.1'] }] };
  const pull = { number: 91, head: { sha: headRevision }, base: { sha: baseRevision, ref: 'main', repo: { full_name: repository } }, body: contextBody({ issues: [`${repository}#90`], basis: [policyRef], plan_items: record.plan_items }) };
  const result = await evaluateCloseout({ trace: { repository, adapter }, record, pull, policy: { policy_ref: policyRef, config: { repository: { openspec_root: 'openspec' } } } });
  return { result, reads, dependency, manifest };
}

for (const dependencyKind of ['pr', 'issue']) {
  test(`issue36 delivery: manifest inventory matches actual ${dependencyKind} resource in its own identity array`, async () => {
    const { result, reads, dependency } = await assess({ dependencyKind });
    assert.equal(result.manifest.valid, true, JSON.stringify(result.manifest.findings));
    assert.deepEqual(result.inventoryFindings, []);
    assert.ok(reads.includes(dependency), 'kind is acquired before matching inventory');
  });
  test(`issue36 delivery: ${dependencyKind} identity in the wrong manifest array cannot qualify`, async () => {
    const { result } = await assess({ dependencyKind, wrongArray: true });
    assert.ok(result.inventoryFindings.some((finding) => finding.code === 'manifest-inventory-incomplete'), JSON.stringify(result.inventoryFindings));
  });
}
