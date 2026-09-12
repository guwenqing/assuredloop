import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { makeConfig, makeGitFixture, makePackageFixture } from '../adoption/helpers.js';

export const packageRoot = new URL('../../../', import.meta.url).pathname;
const metadata = JSON.parse(readFileSync(new URL('../../../contracts/metadata.json', import.meta.url), 'utf8'));
export const head = 'a'.repeat(40);
export function config({ routing = { primary_tool: 'codex', additional: 'on-request' }, tools = ['codex'] } = {}) {
  const value = makeConfig(metadata, { tools, repository: 'example/consumer' });
  value.project.review.internal.allowed_models = ['owner-model-r7'];
  value.project.review.excluded_models = ['owner-model-rejected'];
  value.project.review.model_aliases = { chosen: 'owner-model-r7' };
  if (routing !== null) value.project.review.routing = routing;
  return value;
}
export function policy(options) {
  return { status: 'available', config: config(options), mode: 'bootstrap' };
}
export function evidence(overrides = {}) {
  return { head, scope: 'Assigned consumer routing change', result: 'pass',
    evidence: [{ repository: 'example/consumer', comment_id: 37 }],
    producer_session: 'owner-model-r7:producer', reviewer_session: 'owner-model-r7:independent-reviewer',
    reviewer_model: 'owner-model-r7', review_depth: 'full-scope',
    review_kind: 'internal', review_tool: 'codex', ...overrides };
}
export const failures = (findings) => findings.filter((item) => item.severity !== 'review');
export function eligible(findings) {
  assert.deepEqual(failures(findings), [], JSON.stringify(findings));
  assert.ok(!findings.some((item) => /kind-unresolved/.test(item.code)), JSON.stringify(findings));
}
export function diagnostic(findings, pattern) {
  assert.ok(failures(findings).some((item) => pattern.test(JSON.stringify(item))), JSON.stringify(findings));
}
export async function initializationFixture(t, options) {
  const pkg = await makePackageFixture({ sourceRef: { repository: 'framework/source', revision: 'b'.repeat(40), path: 'openspec/specs' } });
  const target = await makeGitFixture({ prefix: 'issue37-consumer-', remote: 'https://github.com/example/consumer.git',
    files: { 'README.md': '# Consumer\n', 'openspec/config.yaml': 'schema: spec-driven\n' } });
  t.after(async () => { await rm(pkg.root, { recursive: true, force: true }); await rm(target.root, { recursive: true, force: true }); });
  const selected = config(options);
  selected.project.workflow = makeConfig(pkg.metadata).project.workflow;
  return { config: selected, targetRoot: target.root, packageRoot: pkg.root, localOnly: true };
}
