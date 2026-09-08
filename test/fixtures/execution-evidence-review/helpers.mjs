import { readFile, writeFile } from 'node:fs/promises';

import {
  makeTraceFixture,
  workPull,
} from '../trace-cli/helpers.mjs';
import { makeNonPrFixture } from '../non-pr-cli/helpers.mjs';
import { makeCloseoutFixture } from '../closeout-cli/helpers.mjs';

const repository = 'example/consumer';

function clone(value) {
  return structuredClone(value);
}

function ordinaryRecord(record, overrides = {}) {
  const result = clone(record);
  for (const field of ['producer_session', 'reviewer_session', 'reviewer_model', 'review_depth']) delete result[field];
  result.command = 'node --test test/trace-cli.test.js';
  result.exit_code = 0;
  Object.assign(result, overrides);
  return result;
}

async function scenarioFor(fixture) {
  return JSON.parse(await readFile(fixture.env.FAKE_GH_SCENARIO, 'utf8'));
}

async function writeScenario(fixture, scenario) {
  await writeFile(fixture.env.FAKE_GH_SCENARIO, `${JSON.stringify(scenario)}\n`);
}

function replaceComment(pages, id, body) {
  return pages.map((page) => page.map((entry) => entry.id === id ? { ...entry, body } : entry));
}

function removeComment(pages, id) {
  return pages.map((page) => page.filter((entry) => entry.id !== id));
}

/**
 * Add one valid command/exit-only Evidence record beside the existing review
 * Evidence in the read-only trace fixture. `mode: verification-only` removes
 * the review record; `mode: partial-review` removes one review declaration.
 */
export async function makeTraceEvidenceFixture(t, { mode = 'mixed', ordinary = {} } = {}) {
  const fixture = await makeTraceFixture(t);
  const scenario = await scenarioFor(fixture);
  const reviewBody = scenario.records['issues/comments/101'].body;
  const review = JSON.parse(reviewBody);
  const ordinaryValue = ordinaryRecord(review, ordinary);
  const ordinaryBody = JSON.stringify(ordinaryValue, null, 2);
  let issueComments = scenario.records['issues/42/comments'];
  let pullComments = scenario.records['issues/43/comments'];
  if (mode === 'verification-only') {
    issueComments = removeComment(issueComments, 101);
    pullComments = removeComment(pullComments, 101);
  } else if (mode === 'partial-review') {
    const partial = clone(review);
    delete partial.reviewer_session;
    const partialBody = JSON.stringify(partial, null, 2);
    issueComments = replaceComment(issueComments, 101, partialBody);
    pullComments = replaceComment(pullComments, 101, partialBody);
  }
  if (mode !== 'partial-review') {
    issueComments = issueComments.map((page, index) => index === 0
      ? [...page, { id: 109, body: ordinaryBody }]
      : page);
    pullComments = pullComments.map((page, index) => index === 0
      ? [...page, { id: 109, body: ordinaryBody }]
      : page);
  }
  scenario.records['issues/42/comments'] = issueComments;
  scenario.records['issues/43/comments'] = pullComments;
  scenario.records['issues/comments/109'] = { id: 109, body: ordinaryBody };
  await writeScenario(fixture, scenario);
  return { ...fixture, ordinaryEvidence: ordinaryValue, ordinaryBody };
}

export async function makeNonPrEvidenceFixture(t, { ordinary = {} } = {}) {
  const fixture = await makeNonPrFixture(t);
  const scenario = await scenarioFor(fixture);
  const ordinaryValue = ordinaryRecord(fixture.researchEvidence, ordinary);
  const ordinaryBody = JSON.stringify(ordinaryValue, null, 2);
  scenario.records['issues/60/comments'] = [[
    { id: 500, body: 'Owner accepted the current fixed policy context.' },
    { id: 601, body: ordinaryBody },
  ]];
  scenario.records['issues/comments/601'] = { id: 601, body: ordinaryBody };
  await writeScenario(fixture, scenario);
  return { ...fixture, ordinaryEvidence: ordinaryValue, ordinaryBody };
}

export async function makeCloseoutEvidenceFixture(t) {
  const fixture = await makeCloseoutFixture(t);
  const scenario = await scenarioFor(fixture);
  const original = JSON.parse(scenario.records['issues/comments/901'].body);
  const ordinaryValue = ordinaryRecord(original);
  const ordinaryBody = JSON.stringify(ordinaryValue, null, 2);
  scenario.records['issues/90/comments'][0].push({ id: 902, body: ordinaryBody });
  scenario.records['issues/91/comments'][0].push({ id: 902, body: ordinaryBody });
  scenario.records['issues/comments/902'] = { id: 902, body: ordinaryBody };
  await writeScenario(fixture, scenario);
  return { ...fixture, ordinaryEvidence: ordinaryValue, ordinaryBody };
}

export { clone, ordinaryRecord, repository, workPull };
