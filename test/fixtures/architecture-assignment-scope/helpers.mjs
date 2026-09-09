import {
  createTrace, destinationConfig, endpoints, foreignFixture, foreignRepository,
  saveScenario, scenarioOf, setIssue, withFixtureEnv, work,
} from '../architecture-acquisition/helpers.mjs';
import {
  addIncidentalReferences, bodyFor, makeAssignedFixture, replaceIssueContext, workIssue,
} from '../architecture-execution-exception/helpers.mjs';
import { installBoundaryFakeGh } from '../trace-external-boundaries/helpers.mjs';

export { createTrace, endpoints, foreignRepository, saveScenario, scenarioOf, withFixtureEnv, work, workIssue, bodyFor };
export const foreignPullWork = `${foreignRepository}#270`;
export const narrowPullWork = 'example/consumer#70';

export async function makeAssignmentScopeFixture(t, { assigned = true } = {}) {
  const fixture = await foreignFixture(t);
  await setIssue(fixture, { category: 'epic' });
  await destinationConfig(fixture, { branch: 'assignment-narrow', allowed: [] });
  const scenario = await scenarioOf(fixture);
  const unrelated = bodyFor({ issues: ['example/consumer#99'], basis: [], no_spec_reason: 'Separately assigned unrelated work.' },
    `A prose reference to ${work} is not an assignment.`);
  scenario.records['issues/70'].body = unrelated;
  scenario.records['pulls/70'].body = unrelated;
  scenario.foreignRecords[foreignRepository]['pulls/270'] = {
    ...structuredClone(scenario.records['pulls/70']), number: 270,
    body: assigned ? bodyFor({ issues: [work], basis: [], no_spec_reason: 'Explicit assignment from an allowed repository.' }) : unrelated,
    base: { ref: 'trunk', sha: fixture.foreign.revision, repo: { full_name: foreignRepository } },
    head: { ref: 'assignment-candidate', sha: fixture.foreign.revision, repo: { full_name: foreignRepository } },
  };
  await saveScenario(fixture, scenario);
  return fixture;
}

export async function makeIncidentalBodyFixture(t, { drift = false } = {}) {
  const fixture = await makeAssignedFixture(t, { backlinks: false });
  await replaceIssueContext(fixture, { category: 'epic' });
  await addIncidentalReferences(fixture);
  await installBoundaryFakeGh(fixture);
  const scenario = await scenarioOf(fixture);
  const original = structuredClone(scenario.records['pulls/44']);
  const changed = { ...original, body: bodyFor({
    issues: [workIssue], basis: [], no_spec_reason: 'The previously incidental PR now explicitly assigns the observed Issue.',
  }) };
  scenario.repositoryMetadata = { full_name: 'example/consumer', private: false, default_branch: 'main' };
  if (drift) scenario.endpointSequences = { 'repos/example/consumer/pulls/44': [original, changed] };
  await saveScenario(fixture, scenario);
  return { ...fixture, originalPull: original, changedPull: changed };
}
