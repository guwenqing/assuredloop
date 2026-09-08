import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('./manual-report-explicit.txt', import.meta.url);

const sourceRef = {
  repository: 'example/consumer',
  revision: 'dddddddddddddddddddddddddddddddddddddddd',
  path: 'reports/explicit-delivery.txt',
};

const policyRef = {
  repository: 'example/consumer',
  revision: 'cccccccccccccccccccccccccccccccccccccccc',
  path: 'openspec/specs/policy.md',
  anchor: 'requirement-policy',
};

const sourceScope = 'The bounded trace package described by this report.';

function gitSource() {
  return { kind: 'git-blob', representation: 'raw-bytes', ref: structuredClone(sourceRef) };
}

function row(scope) {
  return {
    issues: ['example/consumer#81'],
    prs: ['example/consumer#82'],
    reviewed_head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    result: 'pass',
    scope,
    base_ref: 'main',
    base_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    policy_ref: structuredClone(policyRef),
    policy_mode: 'bootstrap',
    content_sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    source: gitSource(),
  };
}

export async function loadManualSummaryCases() {
  const raw = await readFile(fixtureUrl);
  const cases = [
    { name: 'case-a', source: gitSource(), row: row(sourceScope) },
    { name: 'case-b', source: gitSource(), row: row('The complete repository release and closeout outcome.') },
  ];
  return {
    raw,
    rawSource: raw,
    sourceRef: structuredClone(sourceRef),
    sourceScope,
    sourceRow: row(sourceScope),
    callerRows: cases.map((item) => structuredClone(item.row)),
    cases,
  };
}
