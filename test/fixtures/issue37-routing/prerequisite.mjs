import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routingFixture } from './helpers.mjs';
import { git, sha256 } from '../trace-cli/helpers.mjs';
import { wrap } from '../issue23-consumer/helpers.mjs';

export async function routedPrerequisiteFixture(t, { reviews = 'paired' } = {}) {
  const f = await routingFixture(t, { additional: 'required' });
  const records = f.store.records;
  const repository = 'example/consumer';
  const historicalBase = f.primary.base_sha;
  const planPath = 'openspec/changes/issue37-prerequisite/tasks.md';
  await mkdir(path.dirname(path.join(f.root, planPath)), { recursive: true });
  await writeFile(path.join(f.root, planPath), `## 1. Delivered planning contribution\n\nWork Issue: [#40](https://github.com/${repository}/issues/40)\n\n- [x] 1.1 Deliver this planning contribution.\n- [ ] 1.2 Deliver a separate remaining contribution.\n`);
  await git(f.root, ['add', planPath]);
  const reviewedTree = (await git(f.root, ['write-tree'])).stdout.trim();
  const commit = async (tree, parent, message) => (await git(f.root, ['commit-tree', tree, '-p', parent, '-m', message])).stdout.trim();
  const reviewedHead = await commit(reviewedTree, historicalBase, 'reviewed original contribution');
  const merge = await commit(reviewedTree, historicalBase, 'delivered original contribution squash');
  const plan = { repository, revision: reviewedHead, path: planPath };
  const original = { issues: [`${repository}#40`], change: 'issue37-prerequisite', basis: [f.primary.policy_ref],
    plan_items: [{ ...plan, items: ['1.1'] }] };
  records['issues/40'] = { number: 40, state: 'open', state_reason: null, title: 'Canonical original planning owner',
    labels: [{ name: 'type:architecture-task' }], repository_url: `https://api.github.com/repos/${repository}`,
    body: wrap({ activity: 'plan', request: `${repository}#1`, change: 'issue37-prerequisite', basis: [f.primary.policy_ref],
      plan_items: [{ ...plan, items: ['1.1', '1.2'] }] }) };
  records['issues/40/timeline'] = [[]];
  records['issues/41'] = { number: 41, state: 'closed', title: 'Delivered planning contribution', body: wrap(original),
    repository_url: `https://api.github.com/repos/${repository}`, pull_request: { url: `https://api.github.com/repos/${repository}/pulls/41` } };
  records['pulls/41'] = { number: 41, state: 'closed', merged: true, merged_at: '2026-09-12T12:00:00Z',
    merge_commit_sha: merge, body: wrap(original), title: 'Delivered planning contribution',
    head: { ref: 'original', sha: reviewedHead, repo: { full_name: repository } },
    base: { ref: 'main', sha: merge, repo: { full_name: repository } } };
  records['pulls/41/files'] = [[{ filename: planPath, status: 'added' }]];
  const primary = { ...structuredClone(f.primary), pr: `${repository}#41`, head: reviewedHead,
    scope: 'Full original planning contribution 1.1; separate remaining owner task 1.2 is not delivered by this PR.',
    evidence: [{ repository, comment_id: 100 }, plan] };
  const external = { ...structuredClone(primary), review_kind: 'external', reviewer_session: 'original-additional-session' };
  const originalReviews = reviews === 'primary-only' ? [primary] : reviews === 'external-only' ? [external] : [primary, external];
  const comments = originalReviews.map((record, index) => ({ id: 401 + index, body: wrap(record) }));
  // The PR is a real delivered contribution; its canonical owner is still open
  // and retains another task. All original review sources live on that owner.
  records['issues/40/comments'] = [comments];
  records['issues/41/comments'] = [[]];
  for (const comment of comments) records[`issues/comments/${comment.id}`] = comment;

  // A later explicit policy change makes current additional review on-request.
  // It cannot relax the original delivered PR's recorded required policy.
  f.config.project.review.routing.additional = 'on-request';
  const configBytes = `${JSON.stringify(f.config, null, 2)}\n`;
  await writeFile(path.join(f.root, '.assuredloop/config.json'), configBytes);
  await git(f.root, ['add', '.assuredloop/config.json']);
  const currentTree = (await git(f.root, ['write-tree'])).stdout.trim();
  const currentBase = await commit(currentTree, merge, 'later accepted on-request routing');
  const currentHead = await commit(currentTree, currentBase, 'current dependent contribution');
  await git(f.root, ['update-ref', 'HEAD', currentHead]);
  records['git/ref/heads/main'].object.sha = currentBase;
  records['pulls/43'].base.sha = currentBase;
  records['pulls/43'].head.sha = currentHead;
  records['pulls/41'].base.sha = currentBase;
  Object.assign(f.primary, { base_sha: currentBase, head: currentHead, config_digest: sha256(configBytes) });
  f.issueRecord.depends_on = [`${repository}#41`];
  await f.save();
  return { ...f, historicalBase, reviewedHead, originalReviews };
}
