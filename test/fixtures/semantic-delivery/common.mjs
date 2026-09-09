import { categoryMapping } from '../work-records/helpers.mjs';

export const repository = 'example/consumer';
export const frameworkRepository = 'example/framework';
export const revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const taskRevisions = new Map([
  [201, '1111111111111111111111111111111111111111'],
  [202, '2222222222222222222222222222222222222222'],
]);
export const destinationBase = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const contributionHead = 'cccccccccccccccccccccccccccccccccccccccc';
export const contributionMerge = 'dddddddddddddddddddddddddddddddddddddddd';

export const basisPath = 'openspec/changes/delivery-boundary/specs/trace.md';
export const tasksPath = 'openspec/changes/delivery-boundary/tasks.md';

export function repoRef(path, extra = {}) {
  return { repository: frameworkRepository, revision, path, ...extra };
}

export function taskRevisionFor(issueNumber) {
  const taskRevision = taskRevisions.get(issueNumber);
  if (!taskRevision) throw new RangeError(`No simulated task revision is defined for Issue ${issueNumber}.`);
  return taskRevision;
}

export function planRef(items, taskRevision = revision) {
  return { ...repoRef(tasksPath, { revision: taskRevision }), items };
}

export function taskSourceFor(issueNumber) {
  return `# Delivery boundary tasks\n\n## 3. Verification\n\nWork Issue: [#${issueNumber}](https://github.com/example/consumer/issues/${issueNumber})\n\n- [ ] 3.6 Verify the records change at the assessed destination\n`;
}

export function commentRef(comment_id) {
  return { repository, comment_id };
}

function bodyFor(record, assignment, plan) {
  return [
    assignment,
    '',
    plan,
    '',
    '## Workflow context',
    '',
    '```json',
    JSON.stringify(record, null, 2),
    '```',
    '',
  ].join('\n');
}

function packageBinding() {
  return {
    name: 'assuredloop-base',
    version: '0.1.0',
    integrity: 'sha512-mcUx0jA55mtUaIXvj99QRYMokwDzhqsfmssnausUK4T8n1ZlqeVOavMWAnOmDo935svRXQ2BhczYW+l3QYfn7A==',
    source_ref: {
      repository: 'guwenqing/assuredloop-base',
      revision: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      path: 'contracts',
    },
    contracts_path: 'contracts',
  };
}

export function makeCase({ issueNumber, pullNumber, issueAssignment, issuePlan }) {
  const work = `${repository}#${issueNumber}`;
  const pullWork = `${repository}#${pullNumber}`;
  const basis = repoRef(basisPath, { anchor: 'trace-destination' });
  const taskRevision = taskRevisionFor(issueNumber);
  const planItems = [planRef(['3.6'], taskRevision)];
  const issueRecord = {
    activity: 'deliver',
    request: `${repository}#150`,
    change: 'delivery-boundary',
    basis: [basis],
    plan_items: planItems,
    split_rationale: 'The destination check is independently reviewable before owner-led release work.',
  };
  const pullRecord = {
    issues: [work],
    change: 'delivery-boundary',
    basis: [basis],
    plan_items: planItems,
  };
  const evidenceRecord = {
    head: contributionHead,
    scope: 'Observed contribution at the integration destination.',
    result: 'pass',
    evidence: [commentRef(700 + issueNumber), repoRef(tasksPath, { revision: taskRevision })],
    pr: pullWork,
    base_ref: 'integration',
    base_sha: destinationBase,
    policy_ref: repoRef('openspec/changes/delivery-boundary/design.md', { anchor: 'review-boundary' }),
    contract_package: packageBinding(),
    config_digest: '1111111111111111111111111111111111111111111111111111111111111111',
    activation_digest: null,
    policy_mode: 'bootstrap',
    producer_session: `producer-${issueNumber}`,
    reviewer_session: `reviewer-${issueNumber}`,
    reviewer_model: 'gpt-6-astra',
    review_depth: 'full-scope',
  };
  const issue = {
    number: issueNumber,
    title: 'Delivery boundary assessment',
    labels: [{ name: 'type:task' }],
    body: bodyFor(issueRecord, issueAssignment, issuePlan),
    state: 'closed',
    state_reason: 'completed',
    html_url: `https://github.com/${repository}/issues/${issueNumber}`,
    repository_url: `https://api.github.com/repos/${repository}`,
  };
  const pull = {
    number: pullNumber,
    title: 'Records contribution',
    body: bodyFor(
      pullRecord,
      'Contribution note: the records change was merged after the scoped checks at the integration destination.',
      'Plan prose: verify task 3.6 against the immutable basis and record the destination result.',
    ),
    state: 'closed',
    merged: true,
    merged_at: '2026-09-08T15:00:00Z',
    merge_commit_sha: contributionMerge,
    html_url: `https://github.com/${repository}/pull/${pullNumber}`,
    repository_url: `https://api.github.com/repos/${repository}`,
    head: {
      sha: contributionHead,
      ref: `feature/delivery-boundary-${issueNumber}`,
      repo: { full_name: repository },
    },
    base: {
      sha: destinationBase,
      ref: 'integration',
      repo: { full_name: repository },
    },
  };
  return {
    work,
    categoryMapping,
    issue,
    pulls: [pull],
    evidence: [{ ref: commentRef(700 + issueNumber), record: evidenceRecord }],
  };
}

export const basisSource = `# Delivery boundary\n\n## Trace destination\n\nThe scoped records requirement describes the destination and the evidence needed to assess it.\n\n## Review boundary\n\nThe owner reviews the assignment and the observed destination separately.\n`;

export const taskSource = taskSourceFor(201);

export const policySource = `# Delivery boundary policy\n\n## Review boundary\n\nThe assigned destination and the complete outcome are assessed from the original request.\n`;
