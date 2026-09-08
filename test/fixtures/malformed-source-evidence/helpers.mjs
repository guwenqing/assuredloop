import { readFile, writeFile } from 'node:fs/promises';

import { makeTraceEvidenceFixture } from '../execution-evidence-review/helpers.mjs';

function removeComment(pages, id) {
  return pages.map((page) => page.filter((entry) => entry.id !== id));
}

function addComment(pages, id, body) {
  return pages.map((page, index) => index === 0 ? [...page, { id, body }] : page);
}

function replaceComment(pages, id, body) {
  return pages.map((page) => page.map((entry) => entry.id === id ? { ...entry, body } : entry));
}

function stripOrdinary(scenario) {
  scenario.records['issues/42/comments'] = removeComment(scenario.records['issues/42/comments'], 109);
  scenario.records['issues/43/comments'] = removeComment(scenario.records['issues/43/comments'], 109);
}

async function scenarioFor(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

async function saveScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

export async function makeInvalidOrdinaryEvidenceFixture(t) {
  return makeTraceEvidenceFixture(t, { mode: 'mixed', ordinary: { exit_code: 'zero' } });
}

export async function makeMalformedContextFixture(t) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  const malformedBody = [
    'Execution note with an explicit malformed source marker: malformed-trailing-comma.',
    '',
    '## Workflow context',
    '',
    '```json',
    '{',
    '  "head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",',
    '  "scope": "malformed-trailing-comma",',
    '  "result": "pass",',
    '  "evidence": [{"repository": "example/consumer", "comment_id": 100}],',
    '}',
    '```',
    '',
  ].join('\n');
  scenario.records['issues/42/comments'] = addComment(scenario.records['issues/42/comments'], 110, malformedBody);
  scenario.records['issues/43/comments'] = addComment(scenario.records['issues/43/comments'], 110, malformedBody);
  scenario.records['issues/comments/110'] = { id: 110, body: malformedBody };
  await saveScenario(fixture, scenario);
  return { ...fixture, malformedBody };
}

const contextBodies = {
  duplicate: [
    '## Workflow context', '', '```json', '{"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scope":"duplicate","result":"pass","evidence":[{"repository":"example/consumer","comment_id":100}]}', '```',
    '', '## Workflow context', '', '```json', '{"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scope":"duplicate-again","result":"pass","evidence":[{"repository":"example/consumer","comment_id":100}]}', '```', '',
  ].join('\n'),
  incomplete: [
    '## Workflow context', '', '```json', '{"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scope":"incomplete","result":"pass",', '',
  ].join('\n'),
  invalidShape: [
    '## Workflow context', '', '```json', '{"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scope":"invalid-shape","result":"pass","evidence":[]}', '```', '',
  ].join('\n'),
};

export async function makeContextVariantFixture(t, variant) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  stripOrdinary(scenario);
  const body = contextBodies[variant];
  if (!body) throw new Error(`Unknown context variant: ${variant}`);
  scenario.records['issues/42/comments'] = addComment(scenario.records['issues/42/comments'], 120, body);
  scenario.records['issues/43/comments'] = addComment(scenario.records['issues/43/comments'], 120, body);
  scenario.records['issues/comments/120'] = { id: 120, body };
  await saveScenario(fixture, scenario);
  return { ...fixture, body };
}

export async function makeEvidenceFieldFixture(t, field) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  const ordinary = JSON.parse(scenario.records['issues/comments/109'].body);
  delete ordinary[field];
  const body = JSON.stringify(ordinary, null, 2);
  scenario.records['issues/42/comments'] = replaceComment(scenario.records['issues/42/comments'], 109, body);
  scenario.records['issues/43/comments'] = replaceComment(scenario.records['issues/43/comments'], 109, body);
  scenario.records['issues/comments/109'] = { id: 109, body };
  await saveScenario(fixture, scenario);
  return { ...fixture, body };
}

export async function makeDecisionFixture(t, variant) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  stripOrdinary(scenario);
  const valid = {
    record_type: 'self-change-decision',
    selection: 'not-accepted',
    work: null,
    rationale: 'The owner did not accept this self-change path.',
    authorized_by: 'example-owner',
    evidence: [{ repository: 'example/consumer', comment_id: 100 }],
  };
  const value = structuredClone(valid);
  if (variant === 'invalid') delete value.rationale;
  if (variant === 'mixed') Object.assign(value, {
    head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scope: 'mixed-declaration',
    result: 'pass',
  });
  const body = JSON.stringify(value, null, 2);
  scenario.records['issues/42/comments'] = addComment(scenario.records['issues/42/comments'], 121, body);
  scenario.records['issues/43/comments'] = addComment(scenario.records['issues/43/comments'], 121, body);
  scenario.records['issues/comments/121'] = { id: 121, body };
  await saveScenario(fixture, scenario);
  return { ...fixture, body };
}

export async function makeUnknownDiscriminatorFixture(t) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  stripOrdinary(scenario);
  const value = {
    record_type: 'future-unknown',
    head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    scope: 'unknown discriminator but Evidence-like fields',
    result: 'pass',
    evidence: [{ repository: 'example/consumer', comment_id: 100 }],
    exit_code: 'zero',
  };
  const body = JSON.stringify(value, null, 2);
  scenario.records['issues/42/comments'] = addComment(scenario.records['issues/42/comments'], 122, body);
  scenario.records['issues/43/comments'] = addComment(scenario.records['issues/43/comments'], 122, body);
  scenario.records['issues/comments/122'] = { id: 122, body };
  await saveScenario(fixture, scenario);
  return { ...fixture, body };
}

export async function makeUnrelatedJsonFixture(t) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  stripOrdinary(scenario);
  const body = JSON.stringify({ result: 'pass', note: 'A result-only collaboration artifact.' }, null, 2);
  scenario.records['issues/42/comments'] = addComment(scenario.records['issues/42/comments'], 123, body);
  scenario.records['issues/43/comments'] = addComment(scenario.records['issues/43/comments'], 123, body);
  scenario.records['issues/comments/123'] = { id: 123, body };
  await saveScenario(fixture, scenario);
  return { ...fixture, body };
}

export async function makeSupportingReferenceFixture(t, { malformed = false } = {}) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  const ordinary = JSON.parse(scenario.records['issues/comments/109'].body);
  const commentId = malformed ? 131 : 130;
  const supportBody = malformed
    ? [
      'Supporting artifact with an explicit malformed context marker: malformed-supporting-context.',
      '', '## Workflow context', '', '```json',
      '{"head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scope":"malformed-supporting-context",}',
      '```', '',
    ].join('\n')
    : JSON.stringify({ head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', command: 'node --test', note: 'generic supporting artifact' }, null, 2);
  ordinary.evidence.push({ repository: 'example/consumer', comment_id: commentId });
  const ordinaryBody = JSON.stringify(ordinary, null, 2);
  scenario.records['issues/42/comments'] = scenario.records['issues/42/comments'].map((page) => page.map((entry) => entry.id === 109 ? { ...entry, body: ordinaryBody } : entry));
  scenario.records['issues/43/comments'] = scenario.records['issues/43/comments'].map((page) => page.map((entry) => entry.id === 109 ? { ...entry, body: ordinaryBody } : entry));
  scenario.records['issues/comments/109'] = { id: 109, body: ordinaryBody };
  scenario.records[`issues/comments/${commentId}`] = { id: commentId, body: supportBody };
  await saveScenario(fixture, scenario);
  return { ...fixture, supportBody, supportCommentId: commentId };
}

export async function makeProseOnlyFixture(t) {
  const fixture = await makeTraceEvidenceFixture(t, { mode: 'mixed' });
  const scenario = await scenarioFor(fixture);
  const proseBody = [
    'Ordinary collaboration prose: ran `node --test`; exit code 0. No Workflow context is declared.',
    '',
    '```markdown',
    '## Workflow context',
    '{"result":"pass","note":"illustrative heading only"}',
    '```',
  ].join('\n');
  scenario.records['issues/42/comments'] = addComment(removeComment(scenario.records['issues/42/comments'], 109), 111, proseBody);
  scenario.records['issues/43/comments'] = addComment(removeComment(scenario.records['issues/43/comments'], 109), 111, proseBody);
  scenario.records['issues/comments/111'] = { id: 111, body: proseBody };
  await saveScenario(fixture, scenario);
  return { ...fixture, proseBody };
}
