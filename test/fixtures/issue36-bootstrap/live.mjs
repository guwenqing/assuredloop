import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { git, makeTraceFixture, repository, sha256 } from '../trace-cli/helpers.mjs';
import { commentSource, gitSource, wrap } from './records.mjs';

export async function makeBootstrapLiveFixture(t, { ownerOnly = false } = {}) {
  const f = await makeTraceFixture(t);
  const store = JSON.parse(await readFile(f.env.FAKE_GH_SCENARIO, 'utf8'));
  const records = store.records;
  const fixed = (revision, name) => ({ repository, revision, path: name });
  const originalPlanPath = 'openspec/changes/bootstrap-live/tasks.md';
  const originalPlan = `## 1. Initial manual bootstrap\n\nWork Issue: [#2](https://github.com/${repository}/issues/2)\n\n- [x] 1.1 Accept the fixed bootstrap binding.\n- [x] 1.2 Deliver the initial configuration.\n- [ ] 1.3 Deliver another planning contribution.\n`;
  await mkdir(path.dirname(path.join(f.root, originalPlanPath)), { recursive: true });
  await writeFile(path.join(f.root, originalPlanPath), originalPlan);
  await git(f.root, ['add', originalPlanPath]);
  const reviewedTree = (await git(f.root, ['write-tree'])).stdout.trim();
  // The original base is an actual accessible root tree with neither config
  // nor activation. Separate reviewed and squash commits share the delivered
  // tree and exact sole base parent. No live repository history is changed.
  await git(f.root, ['update-index', '--force-remove', '.assuredloop/config.json']);
  const absentTree = (await git(f.root, ['write-tree'])).stdout.trim();
  const commit = async (tree, name, parent) => (await git(f.root,
    ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', name])).stdout.trim();
  const base = await commit(absentTree, 'synthetic pre-adoption root');
  const reviewedHead = await commit(reviewedTree, 'reviewed initial bootstrap', base);
  const merge = await commit(reviewedTree, 'actual bootstrap squash', base);
  const currentBase = await commit(reviewedTree, 'later accepted destination', merge);
  await git(f.root, ['read-tree', reviewedTree]);
  await writeFile(path.join(f.root, 'candidate.txt'), 'current dependent contribution\n');
  await git(f.root, ['add', 'candidate.txt']);
  const currentTree = (await git(f.root, ['write-tree'])).stdout.trim();
  const currentHead = await commit(currentTree, 'later dependent candidate', currentBase);
  await git(f.root, ['update-ref', 'HEAD', currentHead]);

  const bootstrap = f.config.project.bootstrap;
  const policySource = commentSource(100, repository);
  const proposalSource = gitSource(bootstrap.proposal_acceptance);
  const proposalBytes = (await git(f.root, ['show', `${bootstrap.proposal_acceptance.revision}:${bootstrap.proposal_acceptance.path}`])).stdout;
  const reviewSource = commentSource(403, repository), deliverySource = commentSource(404, repository);
  const originalReview = `Original independent reviewer original-reviewer assessed original-producer, fixed policy ${JSON.stringify(bootstrap.policy_ref)}, reviewed head ${reviewedHead}, tasks 1.1/1.2. Full-scope pass.\r\nπ e\u0301\n`;
  const originalDelivery = `Owner-authorized initial delivery: squash ${merge}, original base ${base}, reviewed head ${reviewedHead}; planning tasks 1.1 and 1.2 delivered.\r\n`;
  records['issues/comments/403'] = { id: 403, body: originalReview };
  records['issues/comments/404'] = { id: 404, body: originalDelivery };
  const verification = {
    record_type: 'initial-bootstrap-verification', pr: `${repository}#4`, head: reviewedHead,
    base_ref: 'main', base_sha: base, merge_sha: merge,
    bootstrap_ref: fixed(merge, '.assuredloop/config.json'),
    sources: [
      { purpose: 'policy-acceptance', source: policySource, content_sha256: sha256(records['issues/comments/100'].body) },
      { purpose: 'proposal-acceptance', source: proposalSource, content_sha256: sha256(proposalBytes) },
      { purpose: 'review', source: reviewSource, content_sha256: sha256(originalReview) },
      { purpose: 'delivery', source: deliverySource, content_sha256: sha256(originalDelivery) },
    ],
    verified_at: '2026-09-12T18:00:00Z', verification_policy_ref: bootstrap.policy_ref,
    scope: 'Initial bootstrap contribution, tasks 1.1 and 1.2; owner remaining task 1.3 is still open.',
    result: 'pass', producer_session: 'later-verification-producer', reviewer_session: 'later-verification-reviewer',
    reviewer_model: 'gpt-6-astra', review_depth: 'full-scope',
  };
  const tagged = { id: 405, body: wrap(verification) };
  records['issues/comments/405'] = tagged;
  const originalPlanRef = { ...fixed(reviewedHead, originalPlanPath), items: ['1.1', '1.2'] };
  const originalRecord = { issues: [`${repository}#2`], change: 'bootstrap-live', basis: [bootstrap.policy_ref], plan_items: [originalPlanRef] };
  records['issues/2'] = { number: 2, state: 'open', state_reason: null, title: 'Original bootstrap planning',
    labels: [{ name: 'type:architecture-task' }], repository_url: `https://api.github.com/repos/${repository}`,
    body: wrap({ activity: 'plan', request: `${repository}#1`, change: 'bootstrap-live',
      basis: [bootstrap.policy_ref], plan_items: [{ ...originalPlanRef, items: ['1.1', '1.2', '1.3'] }] }) };
  records['issues/2/comments'] = [[tagged]];
  records['issues/2/timeline'] = [[]];
  records['issues/4'] = { number: 4, state: 'closed', body: wrap(originalRecord), title: 'Initial bootstrap contribution',
    repository_url: `https://api.github.com/repos/${repository}`, pull_request: { url: `https://api.github.com/repos/${repository}/pulls/4` } };
  records['pulls/4'] = { number: 4, state: 'closed', merged: true, merged_at: '2026-09-11T18:00:00Z',
    merge_commit_sha: merge, body: wrap(originalRecord), title: 'Initial bootstrap contribution',
    head: { ref: 'original-bootstrap', sha: reviewedHead, repo: { full_name: repository } },
    base: { ref: 'main', sha: currentBase, repo: { full_name: repository } } };
  records['issues/4/comments'] = ownerOnly ? [[]] : [[tagged]];
  records['pulls/4/files'] = [[{ filename: '.assuredloop/config.json', status: 'added' }]];
  const currentIssue = { ...f.issue, depends_on: [`${repository}#4`] };
  records['issues/42'].body = wrap(currentIssue);
  records['issues/42/timeline'] = [[store.records['issues/42/timeline'][0][0]]];
  records['issues/42/comments'] = [[{ id: 101, body: '' }]];
  records['pulls/43'].head.sha = currentHead;
  records['pulls/43'].base.sha = currentBase;
  records['pulls/43/files'] = [[{ filename: 'candidate.txt', status: 'added' }]];
  const currentEvidence = { ...f.evidence, head: currentHead, base_sha: currentBase,
    evidence: [{ repository, comment_id: 100 }, fixed(f.revision, 'openspec/changes/trace-cli/tasks.md')] };
  const currentComment = { id: 101, body: wrap(currentEvidence) };
  records['issues/comments/101'] = currentComment;
  records['issues/42/comments'] = [[currentComment]];
  records['issues/43/comments'] = [[currentComment]];
  records['git/ref/heads/main'].object.sha = currentBase;
  await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(store));
  return { ...f, store, verification, base, reviewedHead, merge, currentBase, currentHead,
    async save() { await writeFile(f.env.FAKE_GH_SCENARIO, JSON.stringify(store)); } };
}
