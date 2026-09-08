export const repository = 'example/consumer';
export const frameworkRepository = 'example/framework';
export const revision = '0123456789abcdef0123456789abcdef01234567';
export const secondRevision = 'fedcba9876543210fedcba9876543210fedcba98';
export const destinationBase = '1111111111111111111111111111111111111111';
export const advancedDestinationBase = '2222222222222222222222222222222222222222';
export const firstHead = '3333333333333333333333333333333333333333';
export const secondHead = '4444444444444444444444444444444444444444';
export const firstMerge = '5555555555555555555555555555555555555555';
export const secondMerge = '6666666666666666666666666666666666666666';
export const prerequisiteHead = '7777777777777777777777777777777777777777';
export const prerequisiteMerge = '8888888888888888888888888888888888888888';

export function repoRef(path, overrides = {}) {
  return { repository: frameworkRepository, revision, path, ...overrides };
}

export function consumerRepoRef(path, overrides = {}) {
  return { repository, revision, path, ...overrides };
}

export function planRef(items, overrides = {}) {
  return {
    repository: frameworkRepository,
    revision,
    path: 'openspec/changes/records/tasks.md',
    items,
    ...overrides,
  };
}

export function commentRef(comment_id, owner = repository) {
  return { repository: owner, comment_id };
}

export function workRef(number, owner = repository) {
  return `${owner}#${number}`;
}

export const issueWork = workRef(32);
export const requestWork = workRef(30);
export const prerequisiteWork = workRef(31);
export const firstPullWork = workRef(42);
export const secondPullWork = workRef(43);
export const prerequisitePullWork = workRef(41);

export const primaryBasis = repoRef('openspec/changes/records/specs/traceability.md', {
  anchor: 'record-link-status-checks',
});
export const secondaryBasis = repoRef('openspec/changes/records/design.md', {
  anchor: 'focused-context',
});

export const issueRecord = {
  activity: 'deliver',
  request: requestWork,
  change: 'establish-project-workflow',
  basis: [primaryBasis, secondaryBasis],
  plan_items: [planRef(['3.2', '3.3'])],
  depends_on: [prerequisiteWork],
  prior_work: [workRef(29)],
  split_rationale: 'The record and status checks are independently reviewable before packet integration.',
};

export const noSpecIssueRecord = {
  activity: 'deliver',
  request: requestWork,
  basis: [],
  no_spec_reason: 'This bounded maintenance request has no applicable current requirement.',
  prior_work: [workRef(29)],
};

export const firstPrRecord = {
  issues: [issueWork],
  change: 'establish-project-workflow',
  basis: [primaryBasis],
  plan_items: [planRef(['3.2'])],
};

export const secondPrRecord = {
  issues: [issueWork],
  change: 'establish-project-workflow',
  basis: [secondaryBasis],
  plan_items: [planRef(['3.3'])],
};

export const prerequisiteIssueRecord = {
  activity: 'deliver',
  request: requestWork,
  change: 'establish-project-workflow',
  basis: [primaryBasis],
  plan_items: [planRef(['3.1'])],
};

export const prerequisitePrRecord = {
  issues: [prerequisiteWork],
  change: 'establish-project-workflow',
  basis: [primaryBasis],
  plan_items: [planRef(['3.1'])],
};

export function evidenceRecord({
  pr = firstPullWork,
  head = firstHead,
  baseSha = destinationBase,
  baseRef = 'main',
  result = 'pass',
  scope = 'Scoped record and lifecycle checks',
  evidence = [commentRef(401)],
} = {}) {
  return {
    head,
    scope,
    result,
    evidence,
    pr,
    base_ref: baseRef,
    base_sha: baseSha,
    policy_ref: repoRef('openspec/changes/records/design.md'),
    contract_package: {
      name: 'assuredloop-workflow',
      version: '0.1.0',
      integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      source_ref: repoRef('contracts'),
      contracts_path: 'contracts',
    },
    config_digest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    activation_digest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    policy_mode: 'activation',
    producer_session: 'producer-records-session',
    reviewer_session: 'reviewer-records-session',
    reviewer_model: 'model-alpha',
    review_depth: 'full-scope',
  };
}

export const firstEvidenceRecord = evidenceRecord();
export const secondEvidenceRecord = evidenceRecord({
  pr: secondPullWork,
  head: secondHead,
  baseRef: 'main',
  scope: 'Scoped task mapping checks',
  evidence: [commentRef(402)],
});

export function contextBody(record, {
  title = 'Structured work record',
  assignment = 'Assigned outcome: preserve the scoped record and lifecycle evidence for independent review.',
  plan = 'Plan prose: compare native task mappings and actual delivery facts.',
  heading = '## Workflow context',
  fence = 'json',
} = {}) {
  const opening = `${assignment}\n\n${plan}`;
  if (fence === null) return `${title}\n\n${opening}\n\n${heading}\n${JSON.stringify(record, null, 2)}\n`;
  return `${title}\n\n${opening}\n\n${heading}\n\n\`\`\`${fence}\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
}

export const issueBody = contextBody(issueRecord, {
  title: 'Record lifecycle delivery Task',
  assignment: 'Assigned outcome: preserve assignment prose for the structured record checker.',
  plan: 'Plan prose: check task 3.2 and task 3.3 against the fetched native plan.',
});

export const firstPrBody = contextBody(firstPrRecord, {
  title: 'First scoped contribution',
  assignment: 'Assigned outcome: deliver the first mapped contribution for task 3.2.',
  plan: 'Plan prose: this contribution covers one part of the assigned task.',
});

export const secondPrBody = contextBody(secondPrRecord, {
  title: 'Second scoped contribution',
  assignment: 'Assigned outcome: deliver the second mapped contribution for task 3.3.',
  plan: 'Plan prose: this contribution covers the remaining mapped task.',
});

export const prerequisiteIssueBody = contextBody(prerequisiteIssueRecord, {
  title: 'Closed prerequisite delivery',
  assignment: 'Assigned outcome: deliver the prerequisite record support needed by the dependent work.',
  plan: 'Plan prose: this prerequisite has its own merged contribution and evidence.',
});

export const prerequisitePrBody = contextBody(prerequisitePrRecord, {
  title: 'Merged prerequisite contribution',
  assignment: 'Assigned outcome: deliver the prerequisite contribution for task 3.1.',
  plan: 'Plan prose: the contribution is assessed through its actual merged PR.',
});

export const prerequisiteEvidenceRecord = evidenceRecord({
  pr: prerequisitePullWork,
  head: prerequisiteHead,
  scope: 'Prerequisite delivery formal result',
  evidence: [commentRef(431)],
});

export const researchRecord = {
  head: null,
  no_head_reason: 'The bounded research used an external service and has no Git revision.',
  scope: 'Research findings and limits for the record lifecycle design.',
  result: 'inconclusive',
  evidence: [commentRef(403)],
  producer_session: 'producer-research-session',
  reviewer_session: 'reviewer-research-session',
  reviewer_model: 'model-alpha',
  review_depth: 'full-scope',
};

export const cancellationIssueBody = contextBody(noSpecIssueRecord, {
  title: 'Cancelled bounded request',
  assignment: 'Assigned outcome: this request was considered and then cancelled.',
  plan: 'Plan prose: retain the explanation for semantic review.',
});

export const taskFile = `# Record lifecycle tasks\n\n## 3.1 Prerequisite trace preparation\n\nWork Issue: [#31](https://github.com/example/consumer/issues/31).\n\n- [ ] 3.1 Prepare the prerequisite trace inputs.\n\n## 3. Read-only trace checks\n\nWork Issue: [#32](https://github.com/example/consumer/issues/32).\n\n- [ ] 3.2 Deliver record and link status checks\n- [ ] 3.3 Deliver review-evidence checks\n\n## 3.4 Owner-led closeout\n\nWork Issue: [#70](https://github.com/example/consumer/issues/70).\n\n- [ ] 3.4 Prepare the owner-led closeout candidate.\n`;

export function issueSnapshot({
  number = 32,
  body = issueBody,
  state = 'open',
  state_reason = null,
  repositoryName = repository,
} = {}) {
  return {
    number,
    title: 'Record lifecycle delivery Task',
    body,
    state,
    state_reason,
    html_url: `https://github.com/${repositoryName}/issues/${number}`,
    repository_url: `https://api.github.com/repos/${repositoryName}`,
  };
}

export function pullSnapshot({
  number = 42,
  body = firstPrBody,
  state = 'open',
  merged = false,
  merged_at = null,
  merge_commit_sha = null,
  headSha = firstHead,
  headRef = 'feature/records',
  baseSha = destinationBase,
  baseRef = 'main',
  headRepository = repository,
  baseRepository = repository,
} = {}) {
  return {
    number,
    title: 'Scoped records contribution',
    body,
    state,
    merged,
    merged_at,
    merge_commit_sha,
    html_url: `https://github.com/${repository}/pull/${number}`,
    head: {
      sha: headSha,
      ref: headRef,
      repo: { full_name: headRepository },
    },
    base: {
      sha: baseSha,
      ref: baseRef,
      repo: { full_name: baseRepository },
    },
  };
}

export function prerequisiteBundle({
  state = 'closed',
  state_reason = 'completed',
  merged = true,
  merged_at = '2026-09-08T03:45:00Z',
  merge_commit_sha = prerequisiteMerge,
  evidence = true,
} = {}) {
  return {
    issue: issueSnapshot({
      number: 31,
      body: prerequisiteIssueBody,
      state,
      state_reason,
    }),
    pulls: [pullSnapshot({
      number: 41,
      body: prerequisitePrBody,
      state,
      merged,
      merged_at: merged ? merged_at : null,
      merge_commit_sha: merged ? merge_commit_sha : null,
      headSha: prerequisiteHead,
    })],
    evidence: evidence ? [evidenceEntry(prerequisiteEvidenceRecord, commentRef(430))] : [],
  };
}

export function evidenceEntry(record, ref = commentRef(490)) {
  return { ref: structuredClone(ref), record: structuredClone(record) };
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

export function refKey(ref) {
  return JSON.stringify(canonical(ref));
}
